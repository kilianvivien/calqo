/** A tiny registry that lets UI far from the canvas (e.g. the color picker in
 * the inspector) sample a colour from the live Konva stage. This is the
 * cross-browser fallback for the native `EyeDropper` API, which WebKit/Safari
 * does not implement — sampling the design canvas works everywhere. */
export type StageSampler = {
  /** Arm sampling mode; `onPick` is called once with the chosen colour (or
   * `null` if the user cancelled). */
  begin: (onPick: (hex: string | null) => void) => void;
};

let active: StageSampler | null = null;
let sampling = false;

export function registerStageSampler(sampler: StageSampler | null): void {
  active = sampler;
}

export function isStageSamplerAvailable(): boolean {
  return active !== null;
}

/** True while the user is mid-sample (clicking the canvas) — lets the colour
 * popover stay open instead of treating the canvas click as "click outside". */
export function isStageSampling(): boolean {
  return sampling;
}

export function sampleColorFromStage(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!active) {
      resolve(null);
      return;
    }
    sampling = true;
    active.begin((hex) => {
      sampling = false;
      resolve(hex);
    });
  });
}
