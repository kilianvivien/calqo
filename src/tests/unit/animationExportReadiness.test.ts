import { describe, expect, it } from 'vitest';
import {
  animWarningIdentity,
  evenDimensions,
  isArtboardAnimatable,
  isCodecUsable,
  mp4ConfigWarnings,
  planGifOutput,
} from '@/editor/export/animationExportReadiness';
import { v2AllPresetsProject, v2StaticProject } from '../fixtures/animation/fixtures';
import type { VideoCapabilities } from '@/lib/adapters/video/VideoExportAdapter';

const capabilities: VideoCapabilities = {
  codecs: {
    h264: { supported: true, powerEfficient: false },
    h265: { supported: false, reason: 'codec-unsupported' },
  },
  streamingSupported: true,
  maxTestedWidth: 1080,
  maxTestedHeight: 1920,
  maxTestedFps: 30,
};

describe('animation export readiness', () => {
  it('offers animation formats only when a flattened layer is animated', () => {
    expect(isArtboardAnimatable(v2StaticProject.artboards[0])).toBe(false);
    expect(isArtboardAnimatable(v2AllPresetsProject.artboards[0])).toBe(true);

    const nested = structuredClone(v2StaticProject.artboards[0]);
    const animated = structuredClone(v2AllPresetsProject.artboards[0].layers[0]);
    nested.layers = [
      {
        ...nested.layers[0],
        id: 'group',
        type: 'group',
        children: [animated],
      },
    ];
    expect(isArtboardAnimatable(nested)).toBe(true);
  });

  it('caps GIF duration, long edge, and fps while preserving aspect ratio', () => {
    const plan = planGifOutput(1080, 1920, 60, 60_000);
    expect(plan).toEqual({
      width: 405,
      height: 720,
      fps: 15,
      durationMs: 15_000,
      frameDelayMs: 67,
      frameCount: 225,
      adjusted: true,
    });
    expect(planGifOutput(400, 300, 15, 1_000).adjusted).toBe(false);
  });

  it('normalizes dimensions and emits structured, localizable MP4 warnings', () => {
    expect(evenDimensions(1079, 1919)).toEqual({
      width: 1080,
      height: 1920,
      adjusted: true,
    });
    expect(isCodecUsable(capabilities, 'h264')).toBe(true);
    expect(isCodecUsable(capabilities, 'h265')).toBe(false);
    expect(mp4ConfigWarnings(capabilities, 'h264', 1079, 1919)).toEqual([
      { code: 'softwareEncoding', params: { codec: 'h264' } },
      { code: 'oddDimensionAdjusted', params: { width: 1080, height: 1920 } },
    ]);
    expect(mp4ConfigWarnings(capabilities, 'h265', 1080, 1920)).toEqual([
      { code: 'unsupportedCodec', params: { codec: 'h265' } },
    ]);
  });

  it('builds stable warning identities from codes and interpolation parameters', () => {
    expect(animWarningIdentity({ code: 'gifCaps', params: { fps: 15 } })).toBe(
      'gifCaps:{"fps":15}',
    );
    expect(animWarningIdentity({ code: 'cancellation' })).toBe('cancellation:{}');
  });
});
