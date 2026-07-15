import { isGroupLayer } from '@/editor/utils/layers';
import type { CalqoArtboard, CalqoLayer } from '@/lib/schema';

const stylesheetCache = new Map<string, Promise<string>>();
const fontDataCache = new Map<string, Promise<string | null>>();

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function collectFontFamilies(artboard: CalqoArtboard): Set<string> {
  const families = new Set<string>();
  const visit = (layer: CalqoLayer) => {
    if (layer.type === 'text' || layer.type === 'list') {
      families.add(layer.style.fontFamily);
    }
    if (layer.type === 'image' && layer.frame?.caption) families.add('Inter');
    if (isGroupLayer(layer)) layer.children.forEach(visit);
  };
  artboard.layers.forEach(visit);
  return families;
}

function activeGoogleFontsStylesheet(): string | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com/css2"]')
      ?.href ?? null
  );
}

async function fetchText(url: string): Promise<string> {
  const cached = stylesheetCache.get(url);
  if (cached) return cached;
  const request = fetch(url, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.text() : ''))
    .catch(() => '');
  stylesheetCache.set(url, request);
  return request;
}

async function fetchFontDataUrl(url: string): Promise<string | null> {
  const cached = fontDataCache.get(url);
  if (cached) return cached;
  const request = fetch(url, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => (blob ? blobToDataUrl(blob) : null))
    .catch(() => null);
  fontDataCache.set(url, request);
  return request;
}

/**
 * Embed the Google Font faces already used by the editor into an export.
 * This is best-effort: offline exports still work with their normal fallback
 * fonts, while online exports become portable instead of depending on fonts
 * installed on the viewer's machine.
 */
export async function embeddedFontCss(artboard: CalqoArtboard): Promise<string> {
  const stylesheetUrl = activeGoogleFontsStylesheet();
  if (!stylesheetUrl) return '';

  const families = collectFontFamilies(artboard);
  if (families.size === 0) return '';

  const stylesheet = await fetchText(stylesheetUrl);
  const faces = stylesheet.match(/@font-face\s*{[\s\S]*?}/g) ?? [];
  const selected = faces.filter((face) => {
    const family = face.match(/font-family:\s*['"]([^'"]+)['"]/)?.[1];
    return family ? families.has(family) : false;
  });
  if (selected.length === 0) return '';

  const urls = new Set<string>();
  selected.forEach((face) => {
    for (const match of face.matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/g)) {
      urls.add(match[2]);
    }
  });
  const replacements = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      const dataUrl = await fetchFontDataUrl(url);
      if (dataUrl) replacements.set(url, dataUrl);
    }),
  );

  return selected
    .map((face) => {
      let embedded = face;
      replacements.forEach((dataUrl, url) => {
        embedded = embedded.replaceAll(url, dataUrl);
      });
      return /url\((['"]?)https?:\/\//.test(embedded) ? '' : embedded;
    })
    .filter(Boolean)
    .join('\n');
}
