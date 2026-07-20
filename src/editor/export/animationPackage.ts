import { z } from 'zod';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';
import { assetStorage } from '@/lib/adapters';
import { collectAssetIds } from './rasterExport';
import { exportArtboardHtmlLayout } from './htmlLayoutExport';
import { compileClipCached } from '@/editor/animation/compiler';
import { isArtboardAnimatable } from './animationExportReadiness';
import { flattenLayers, isGroupLayer } from '@/editor/utils/layers';
import { zipBytes, type ZipEntry } from './zip';
import type { HtmlExportWarning } from './exportWarnings';

/**
 * Neutral animation handoff package (plan §11 / AN-3.4). A ZIP containing a
 * self-contained `index.html` (the animated editable HTML), the raw `assets/`
 * it references, a versioned `manifest.json`, and a `README.md`. The package is
 * deliberately tool-neutral: Hyperframes is documented as *one* consumer, but
 * the artifact is plain HTML + CSS + JSON that any headless browser renderer can
 * take. It carries no provider keys, local paths, project history, private
 * settings, or Dexie records — only the explicitly whitelisted fields below.
 */

/** Bumped independently of the project schema version — a package format change
 * must not require a schema migration and vice-versa. */
export const ANIMATION_PACKAGE_MANIFEST_VERSION = 1 as const;

// --- Manifest schema (validated before download) ----------------------------

const easingSchema = z.enum([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'overshoot',
  'bounce',
]);

const compiledKeyframeSchema = z.object({
  t: z.number().finite(),
  value: z.number().finite(),
  easing: easingSchema,
});

const compiledTrackSchema = z.object({
  prop: z.string(),
  keyframes: z.array(compiledKeyframeSchema).min(1),
});

const compiledWindowSchema = z.object({
  start: z.number().finite(),
  duration: z.number().finite(),
  tracks: z.array(compiledTrackSchema),
  wipeDirection: z.enum(['up', 'down', 'left', 'right']).optional(),
});

const compiledClipSchema = z.object({
  sceneDuration: z.number().finite(),
  fps: z.number().finite(),
  compilerVersion: z.number().int(),
  layers: z.array(
    z.object({
      layerId: z.string(),
      windows: z.array(compiledWindowSchema),
    }),
  ),
});

const manifestWarningSchema = z.object({
  tier: z.string(),
  code: z.string(),
  layerName: z.string().optional(),
  reason: z.string().optional(),
});

export const animationPackageManifestSchema = z.object({
  tool: z.literal('calqo'),
  manifestVersion: z.literal(ANIMATION_PACKAGE_MANIFEST_VERSION),
  clip: z.object({
    fps: z.number().finite(),
    sceneDurationMs: z.number().finite(),
  }),
  artboard: z.object({
    id: z.string(),
    name: z.string(),
    width: z.number().finite(),
    height: z.number().finite(),
  }),
  locale: z.string(),
  layers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      animated: z.boolean(),
    }),
  ),
  /** The compiled keyframe IR — the same runtime form the evaluator consumes. */
  ir: compiledClipSchema,
  assets: z.array(
    z.object({
      path: z.string(),
      id: z.string(),
      mimeType: z.string(),
      sha256: z.string(),
    }),
  ),
  /** Content hashes of the emitted text files (index.html, README.md). */
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
  warnings: z.array(manifestWarningSchema),
});

export type AnimationPackageManifest = z.infer<typeof animationPackageManifestSchema>;

export interface AnimationPackageResult {
  zip: Uint8Array<ArrayBuffer>;
  entries: ZipEntry[];
  manifest: AnimationPackageManifest;
  warnings: HtmlExportWarning[];
}

// --- Helpers ----------------------------------------------------------------

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? 'bin';
}

/** Read a Blob's bytes, preferring the standard `arrayBuffer()` but falling
 * back to `FileReader` where a runtime's Blob lacks it. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((b) => new Uint8Array(b));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Background image asset id, if the artboard paints one. */
function backgroundAssetId(artboard: CalqoArtboard): string | null {
  return artboard.background.type === 'image' ? artboard.background.assetId : null;
}

/** Layer ids that actually carry an animation block (top-level or nested). */
function animatedLayerIds(layers: CalqoLayer[]): Set<string> {
  const ids = new Set<string>();
  for (const l of flattenLayers(layers)) {
    if (l.animation) ids.add(l.id);
  }
  return ids;
}

function layerMetadata(layers: CalqoLayer[]): AnimationPackageManifest['layers'] {
  const animated = animatedLayerIds(layers);
  const out: AnimationPackageManifest['layers'] = [];
  const walk = (list: CalqoLayer[]) => {
    for (const l of list) {
      out.push({ id: l.id, name: l.name, type: l.type, animated: animated.has(l.id) });
      if (isGroupLayer(l)) walk(l.children);
    }
  };
  walk(layers);
  return out;
}

function readme(project: CalqoProject, artboard: CalqoArtboard, locale: string): string {
  return `# ${project.name} — ${artboard.name} (animation package)

This is a self-contained, tool-neutral animation package exported from Calqo.

## Contents

- \`index.html\` — a standalone animated HTML file. Open it in any modern
  browser to preview the animation. It embeds its own fonts and images, so it
  needs no network access.
- \`assets/\` — the raw image/SVG assets the design references, provided for
  renderers or agents that prefer external files over the embedded data URIs.
- \`manifest.json\` — machine-readable metadata: clip settings, artboard
  dimensions, locale, per-layer info, the compiled keyframe IR, content hashes,
  and any fidelity warnings. Its \`manifestVersion\` is independent of Calqo's
  project schema version.
- \`README.md\` — this file.

## Rendering to video

The package is plain HTML + CSS + JSON. Any headless-browser renderer can turn
\`index.html\` into a video. For example, HeyGen's Hyperframes (HTML → MP4,
built for agents) can consume it:

\`\`\`sh
# Example only — verify the current Hyperframes CLI at render time.
hyperframes render index.html --out ${slug(artboard.name)}.mp4
\`\`\`

Remotion, Playwright screen-recording, or a custom Puppeteer script work
equally well. The manifest's compiled IR lets an agent re-derive motion without
re-implementing Calqo's compiler.

## Accessibility

The HTML honors \`prefers-reduced-motion\`: viewers who request reduced motion
see the settled design without animation. Renderers that force motion should
emulate \`prefers-reduced-motion: no-preference\`.

## Notes

- Locale: \`${locale}\`
- No API keys, credentials, local file paths, or editing history are included.
`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'clip';
}

// --- Builder ----------------------------------------------------------------

/**
 * Build the neutral animation package for one artboard at one locale. Validates
 * the manifest against {@link animationPackageManifestSchema} before returning;
 * throws if it would be malformed (so a broken package is never downloaded).
 */
export async function buildAnimationPackage(
  project: CalqoProject,
  artboard: CalqoArtboard,
  locale: string,
): Promise<AnimationPackageResult> {
  if (!isArtboardAnimatable(artboard)) {
    throw new Error('artboard has no animation to package');
  }
  const encoder = new TextEncoder();

  // 1. Standalone animated HTML (self-contained: embedded fonts + data URIs).
  const { html, warnings } = await exportArtboardHtmlLayout(artboard, locale, {
    title: `${project.name} — ${artboard.name}`,
    project,
    mode: 'standalone',
  });
  const indexBytes = encoder.encode(html);

  // 2. Raw assets referenced by the artboard (layers + background).
  const assetIds = collectAssetIds(artboard.layers);
  const bg = backgroundAssetId(artboard);
  if (bg) assetIds.add(bg);
  const metaById = new Map(project.assets.map((a) => [a.id, a]));

  const entries: ZipEntry[] = [];
  const manifestAssets: AnimationPackageManifest['assets'] = [];
  for (const id of [...assetIds].sort()) {
    const blob = await assetStorage.getAssetBlob(id);
    if (!blob) continue;
    const bytes = await blobBytes(blob);
    const mime = metaById.get(id)?.mimeType ?? blob.type ?? 'application/octet-stream';
    const path = `assets/${id}.${extForMime(mime)}`;
    entries.push({ name: path, data: bytes });
    manifestAssets.push({ path, id, mimeType: mime, sha256: await sha256Hex(bytes) });
  }

  // 3. Compiled IR for the manifest.
  const { clip } = compileClipCached({
    projectId: project.id,
    artboard,
    locale,
    fps: project.clipSettings?.fps ?? 30,
  });

  const readmeText = readme(project, artboard, locale);
  const readmeBytes = encoder.encode(readmeText);

  const manifest: AnimationPackageManifest = {
    tool: 'calqo',
    manifestVersion: ANIMATION_PACKAGE_MANIFEST_VERSION,
    clip: {
      fps: clip.fps,
      sceneDurationMs: clip.sceneDuration,
    },
    artboard: {
      id: artboard.id,
      name: artboard.name,
      width: artboard.width,
      height: artboard.height,
    },
    locale,
    layers: layerMetadata(artboard.layers),
    ir: clip,
    assets: manifestAssets,
    files: [
      { path: 'index.html', sha256: await sha256Hex(indexBytes) },
      { path: 'README.md', sha256: await sha256Hex(readmeBytes) },
    ],
    warnings: warnings.map((w) => ({
      tier: w.tier,
      code: w.code,
      layerName: w.layerName,
      reason: w.reason,
    })),
  };

  // Validate before download — a malformed manifest must never ship.
  animationPackageManifestSchema.parse(manifest);
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));

  entries.push({ name: 'index.html', data: indexBytes });
  entries.push({ name: 'manifest.json', data: manifestBytes });
  entries.push({ name: 'README.md', data: readmeBytes });

  return { zip: zipBytes(entries), entries, manifest, warnings };
}
