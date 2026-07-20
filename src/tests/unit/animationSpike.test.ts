import { describe, it, expect } from 'vitest';
import { validateProject } from '@/lib/schema';
import { compileClip } from '@/editor/animation/compiler';
import {
  defaultSpikeFixtures,
  type SpikeBuildOpts,
} from '../fixtures/animation/spikeFixtures';
import {
  MeasurementCollector,
  detectEnvironment,
  type MeasurementRecord,
} from '@/spike/animation/measurement';
import {
  isWebCodecsAvailable,
  probeVideoCodecs,
  buildEncoderConfig,
  defaultBitrate,
} from '@/spike/animation/webcodecsProbe';
import { createEncoderProbe } from '@/spike/animation/encoderProbe';
import { NotImplementedError } from '@/editor/rendering/offscreenScene';
import { runSpike, defaultSpikeConfigs } from '@/spike/animation/runSpike';

const SIZES: SpikeBuildOpts[] = [
  { width: 1080, height: 1080, durationMs: 5_000 },
  { width: 1080, height: 1920, durationMs: 60_000 },
];

describe('spike fixtures', () => {
  it('build valid, animated, compilable projects at every size', () => {
    for (const fixture of defaultSpikeFixtures()) {
      for (const size of SIZES) {
        const project = fixture.build(size);
        const res = validateProject(project);
        expect(res.success, `${fixture.id} ${size.width}×${size.height}`).toBe(true);
        const artboard = project.artboards[0];
        expect(artboard.width).toBe(size.width);
        expect(artboard.height).toBe(size.height);
        expect(artboard.timing?.duration).toBe(size.durationMs);

        const { clip, issues } = compileClip({
          projectId: project.id,
          artboard,
          locale: project.activeContentLocale,
          fps: 30,
        });
        expect(issues, `${fixture.id} compile issues`).toEqual([]);
        expect(clip.layers.length).toBeGreaterThan(0);
      }
    }
  });

  it('covers the five required fixture kinds', () => {
    const kinds = defaultSpikeFixtures().map((f) => f.kind).sort();
    expect(kinds).toEqual(['effects', 'flat-vector', 'groups', 'multilingual', 'photo']);
  });
});

describe('measurement collector', () => {
  const record = (over: Partial<MeasurementRecord> = {}): MeasurementRecord => ({
    fixtureId: 'flat-vector',
    label: 'x',
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 5_000,
    codec: 'h264',
    frames: 150,
    evalMs: 2.5,
    status: 'ok',
    ...over,
  });

  it('renders a markdown table and CSV with a header row per record', () => {
    const c = new MeasurementCollector({ os: 'test', runtime: 'vitest' });
    c.add(record());
    c.add(record({ status: 'skipped', note: 'renderer not implemented' }));
    const md = c.toMarkdownTable();
    expect(md.split('\n')).toHaveLength(2 + 2); // header + divider + 2 rows
    expect(md).toContain('flat-vector');
    const csv = c.toCsv();
    expect(csv.split('\n')).toHaveLength(1 + 2);
    expect(csv).toContain('h264');
  });

  it('detects an environment without throwing', () => {
    expect(() => detectEnvironment()).not.toThrow();
  });
});

describe('webcodecs probe — graceful degradation', () => {
  it('reports unavailability in a runtime without WebCodecs (jsdom)', async () => {
    // jsdom has no VideoEncoder; the probe must not throw.
    expect(isWebCodecsAvailable()).toBe(false);
    const results = await probeVideoCodecs([
      { family: 'h264', config: buildEncoderConfig('h264', 1080, 1920, 30) },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].configSupported).toBe(false);
    expect(results[0].reason).toBe('webcodecs-unavailable');
  });

  it('targets a lower bitrate for h265 than h264 at the same size', () => {
    expect(defaultBitrate('h265', 1080, 1920)).toBeLessThan(
      defaultBitrate('h264', 1080, 1920),
    );
  });
});

describe('encoder probe seams', () => {
  it('throw NotImplementedError until AN-0.5.4/0.5.5 land', async () => {
    const mp4 = createEncoderProbe('h264');
    await expect(mp4.begin({ codec: 'h264', width: 1080, height: 1920, fps: 30 })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    const gif = createEncoderProbe('gif');
    await expect(gif.begin({ codec: 'gif', width: 720, height: 720, fps: 15 })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    // cancel is safe before anything is allocated
    await expect(mp4.cancel()).resolves.toBeUndefined();
  });
});

describe('runSpike orchestration (stubbed render/encode)', () => {
  it('produces real evaluation numbers and marks render/encode skipped', async () => {
    const fixtures = defaultSpikeFixtures();
    // One small config per fixture, frame-capped for speed.
    const configs = defaultSpikeConfigs(fixtures).filter(
      (c) => c.width === 1080 && c.height === 1080 && c.durationMs === 5_000,
    );
    const collector = await runSpike({ fixtures, configs, maxFrames: 60 });

    expect(collector.records).toHaveLength(fixtures.length);
    for (const r of collector.records) {
      // Evaluation ran for real…
      expect(r.frames).toBe(60);
      expect(typeof r.evalMs).toBe('number');
      expect(Number.isFinite(r.evalMs!)).toBe(true);
      // The offscreen scene is now implemented (AN-2), so the encoder stub is
      // what's honestly skipped — begin() throws before any frame is rendered.
      expect(r.status).toBe('skipped');
      expect(r.note).toMatch(/AN-0\.5\.[45]/);
      expect(r.renderMs).toBeUndefined();
    }
    // The collector renders without throwing.
    expect(collector.toMarkdownTable()).toContain('skipped');
  });
});
