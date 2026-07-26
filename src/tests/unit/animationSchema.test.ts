import { describe, it, expect } from 'vitest';
import {
  validateProject,
  safeImportProject,
  fixtureProject,
  CURRENT_SCHEMA_VERSION,
  ENTER_EXIT_PRESET_KINDS,
  EMPHASIS_PRESET_KINDS,
  DIRECTIONAL_PRESET_KINDS,
  layerAnimationSchema,
  type LayerAnimation,
  type PresetKind,
} from '@/lib/schema';

const ISO = '2026-07-19T00:00:00.000Z';

function baseProject(): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'p',
    name: 'n',
    createdAt: ISO,
    updatedAt: ISO,
    contentLocales: ['en'],
    activeContentLocale: 'en',
    palette: [],
    assets: [],
    glossary: [],
    artboards: [
      {
        id: 'ab',
        name: 'a',
        preset: 'ig-square',
        width: 1080,
        height: 1080,
        background: { type: 'solid', color: '#ffffff' },
        layers: [],
      },
    ],
  };
}

function shapeLayer(animation?: unknown): Record<string, unknown> {
  return {
    id: 's',
    name: 's',
    type: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: 'solid', color: '#000000' },
    ...(animation ? { animation } : {}),
  };
}

function projectWith(
  animation: unknown,
  timing?: { duration: number },
): Record<string, unknown> {
  const p = baseProject();
  const ab = (p.artboards as Record<string, unknown>[])[0];
  ab.layers = [shapeLayer(animation)];
  if (timing) ab.timing = timing;
  return p;
}

const isDirectional = (kind: PresetKind) =>
  (DIRECTIONAL_PRESET_KINDS as readonly PresetKind[]).includes(kind);

describe('animation schema — acceptance', () => {
  it('accepts a static v2 project with no animation fields', () => {
    expect(validateProject(baseProject()).success).toBe(true);
  });

  it('accepts every enter/exit preset in its slots', () => {
    for (const kind of ENTER_EXIT_PRESET_KINDS) {
      const inst = {
        kind,
        duration: 400,
        delay: 0,
        ...(isDirectional(kind) ? { direction: 'up' } : {}),
      };
      const anim = { mode: 'preset', enter: inst, exit: inst };
      const res = validateProject(projectWith(anim));
      expect(res.success, `enter/exit ${kind}`).toBe(true);
    }
  });

  it('accepts every emphasis preset in the emphasis slot', () => {
    for (const kind of EMPHASIS_PRESET_KINDS) {
      const anim = { mode: 'preset', emphasis: { kind, duration: 800, delay: 0 } };
      expect(validateProject(projectWith(anim)).success, `emphasis ${kind}`).toBe(
        true,
      );
    }
  });

  it('accepts custom tracks for every animatable property', () => {
    const props: Array<[string, number, number]> = [
      ['dx', -100, 0],
      ['dy', 0, 50],
      ['scaleX', 0.5, 1],
      ['scaleY', 0.5, 1],
      ['rotation', 0, 45],
      ['opacity', 0, 1],
      ['wipe-progress', 0, 1],
      ['blur', 8, 0],
    ];
    const anim = {
      mode: 'custom',
      windows: [
        {
          start: 0,
          duration: 1000,
          tracks: props.map(([prop, a, b]) => ({
            prop,
            keyframes: [
              { t: 0, value: a },
              { t: 1, value: b },
            ],
          })),
        },
      ],
    };
    const res = validateProject(projectWith(anim, { duration: 3000 }));
    expect(res.success).toBe(true);
  });
});

describe('animation schema — rejection', () => {
  const reject = (animation: unknown, timing?: { duration: number }) =>
    validateProject(projectWith(animation, timing)).success;

  const customWindow = (tracks: unknown, start = 0, duration = 1000) => ({
    mode: 'custom',
    windows: [{ start, duration, tracks }],
  });

  it('rejects NaN and infinite values', () => {
    expect(
      reject(customWindow([{ prop: 'dx', keyframes: [{ t: 0, value: NaN }, { t: 1, value: 0 }] }])),
    ).toBe(false);
    expect(
      reject(customWindow([{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: Infinity, value: 0 }] }])),
    ).toBe(false);
  });

  it('rejects out-of-range property values', () => {
    expect(
      reject(customWindow([{ prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 2 }] }])),
    ).toBe(false);
    // scale must be strictly > 0
    expect(
      reject(customWindow([{ prop: 'scaleX', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }])),
    ).toBe(false);
  });

  it('rejects unordered or equal keyframe times', () => {
    expect(
      reject(customWindow([{ prop: 'dx', keyframes: [{ t: 0.5, value: 0 }, { t: 0.2, value: 1 }] }])),
    ).toBe(false);
    expect(
      reject(customWindow([{ prop: 'dx', keyframes: [{ t: 0.3, value: 0 }, { t: 0.3, value: 1 }] }])),
    ).toBe(false);
  });

  it('rejects empty tracks and single-keyframe tracks', () => {
    expect(reject(customWindow([]))).toBe(false);
    expect(reject(customWindow([{ prop: 'dx', keyframes: [{ t: 0, value: 0 }] }]))).toBe(false);
  });

  it('rejects duplicate props inside one window', () => {
    expect(
      reject(
        customWindow([
          { prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 10 }] },
          { prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 20 }] },
        ]),
      ),
    ).toBe(false);
  });

  it('rejects overlapping custom windows for the same prop', () => {
    const anim = {
      mode: 'custom',
      windows: [
        { start: 0, duration: 800, tracks: [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 10 }] }] },
        { start: 500, duration: 800, tracks: [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 20 }] }] },
      ],
    };
    expect(reject(anim, { duration: 3000 })).toBe(false);
  });

  it('rejects an unsupported slot/preset combination', () => {
    // pulse is emphasis-only
    expect(reject({ mode: 'preset', enter: { kind: 'pulse', duration: 400, delay: 0 } })).toBe(false);
    // fade is enter/exit-only
    expect(reject({ mode: 'preset', emphasis: { kind: 'fade', duration: 400, delay: 0 } })).toBe(false);
  });

  it('accepts text-reveal presets in the enter slot (AN-3.5)', () => {
    expect(reject({ mode: 'preset', enter: { kind: 'typewriter', duration: 400, delay: 0 } })).toBe(true);
    expect(reject({ mode: 'preset', enter: { kind: 'word-rise', duration: 400, delay: 0 } })).toBe(true);
  });

  it('rejects text-reveal presets outside the enter slot', () => {
    // typewriter/word-rise are enter-only.
    expect(reject({ mode: 'preset', exit: { kind: 'typewriter', duration: 400, delay: 0 } })).toBe(false);
    expect(reject({ mode: 'preset', emphasis: { kind: 'word-rise', duration: 400, delay: 0 } })).toBe(false);
  });

  it('rejects a direction on a non-directional preset', () => {
    expect(
      reject({ mode: 'preset', enter: { kind: 'fade', duration: 400, delay: 0, direction: 'up' } }),
    ).toBe(false);
  });

  it('rejects a preset window that exceeds the scene duration', () => {
    // delay 200 + duration 900 = 1100 ms, past the 1000 ms scene.
    expect(
      reject(
        { mode: 'preset', enter: { kind: 'fade', duration: 900, delay: 200 } },
        { duration: 1000 },
      ),
    ).toBe(false);
  });

  it('rejects a custom window that exceeds the scene duration', () => {
    const anim = customWindow(
      [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 10 }] }],
      900,
      500,
    );
    expect(reject(anim, { duration: 1000 })).toBe(false);
  });

  it('rejects a scene duration below the minimum', () => {
    expect(reject({ mode: 'preset', enter: { kind: 'fade', duration: 100, delay: 0 } }, { duration: 100 })).toBe(false);
  });
});

describe('animation schema — hygiene', () => {
  it('strips unknown keys rather than treating them as an extension escape hatch', () => {
    const parsed = layerAnimationSchema.parse({
      mode: 'preset',
      enter: { kind: 'fade', duration: 400, delay: 0 },
      bogusField: 'nope',
    } as unknown) as LayerAnimation & { bogusField?: unknown };
    expect('bogusField' in parsed).toBe(false);
  });

  it('still validates the existing static fixture after the v2 bump', () => {
    expect(validateProject(fixtureProject).success).toBe(true);
  });

  it('migrates and validates a bare v1 document via safeImportProject', () => {
    const v1 = { ...baseProject(), schemaVersion: 1 };
    const result = safeImportProject(v1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
