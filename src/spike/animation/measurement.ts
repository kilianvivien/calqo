/**
 * AN-0.5 measurement protocol. Types and a collector for the spike's durable
 * output: a table of per-run measurements that seeds the §6.4 performance
 * numbers and the AN-0.5.6 gate decision. No dependencies, no side effects.
 */

export type CodecId = 'h264' | 'h265' | 'gif';

export interface EnvironmentInfo {
  machine?: string;
  os?: string;
  runtime?: string;
  runtimeVersion?: string;
  hardwareConcurrency?: number;
}

export interface RenderConfig {
  fixtureId: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  codec: CodecId;
  bitrateKbps?: number;
}

export type MeasurementStatus = 'ok' | 'skipped' | 'error';

export interface MeasurementRecord extends RenderConfig {
  frames: number;
  /** Pure evaluator cost across all frames (ms). Measurable even without the
   * renderer, so the 1800-frame concern gets a real number from day one. */
  evalMs?: number;
  /** Offscreen render (draw+capture) cost across all frames (ms). */
  renderMs?: number;
  /** Encode + mux cost (ms). */
  encodeMs?: number;
  peakMemoryBytes?: number;
  outputBytes?: number;
  decodeOk?: boolean;
  status: MeasurementStatus;
  note?: string;
}

/** Best-effort runtime environment, guarded for Node/jsdom/browser. */
export function detectEnvironment(): EnvironmentInfo {
  const env: EnvironmentInfo = {};
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { userAgentData?: { platform?: string } })
      : undefined;
  if (nav) {
    env.runtimeVersion = nav.userAgent;
    env.os = nav.userAgentData?.platform ?? nav.platform;
    if (typeof nav.hardwareConcurrency === 'number') {
      env.hardwareConcurrency = nav.hardwareConcurrency;
    }
  }
  const proc = (
    globalThis as { process?: { platform?: string; version?: string } }
  ).process;
  if (proc) {
    env.os = env.os ?? proc.platform;
    env.runtime = env.runtime ?? `node ${proc.version ?? ''}`.trim();
  }
  return env;
}

/** Current JS heap usage where the runtime exposes it (Chromium only). */
export function readHeapBytes(): number | undefined {
  const perf =
    typeof performance !== 'undefined'
      ? (performance as unknown as { memory?: { usedJSHeapSize?: number } })
      : undefined;
  return perf?.memory?.usedJSHeapSize;
}

function round(n: number | undefined, digits = 1): string {
  if (n === undefined) return '—';
  const f = 10 ** digits;
  return String(Math.round(n * f) / f);
}

function bytes(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${round(n / 1024)} KB`;
  return `${round(n / (1024 * 1024))} MB`;
}

const COLUMNS = [
  'fixture',
  'size',
  'fps',
  'dur',
  'codec',
  'frames',
  'evalMs',
  'renderMs',
  'encodeMs',
  'peakMem',
  'output',
  'decode',
  'status',
  'note',
] as const;

function row(r: MeasurementRecord): string[] {
  return [
    r.fixtureId,
    `${r.width}×${r.height}`,
    String(r.fps),
    `${Math.round(r.durationMs / 1000)}s`,
    r.codec,
    String(r.frames),
    round(r.evalMs),
    round(r.renderMs),
    round(r.encodeMs),
    bytes(r.peakMemoryBytes),
    bytes(r.outputBytes),
    r.decodeOk === undefined ? '—' : r.decodeOk ? 'ok' : 'fail',
    r.status,
    r.note ?? '',
  ];
}

/** Accumulates measurements and renders them for the AN-0.5.6 decision block. */
export class MeasurementCollector {
  readonly records: MeasurementRecord[] = [];
  environment: EnvironmentInfo;

  constructor(environment: EnvironmentInfo = detectEnvironment()) {
    this.environment = environment;
  }

  add(record: MeasurementRecord): void {
    this.records.push(record);
  }

  toMarkdownTable(): string {
    const header = `| ${COLUMNS.join(' | ')} |`;
    const divider = `| ${COLUMNS.map(() => '---').join(' | ')} |`;
    const body = this.records.map((r) => `| ${row(r).join(' | ')} |`);
    return [header, divider, ...body].join('\n');
  }

  toCsv(): string {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = COLUMNS.join(',');
    const body = this.records.map((r) => row(r).map(escape).join(','));
    return [header, ...body].join('\n');
  }

  /** A markdown environment summary to paste above the table. */
  environmentSummary(): string {
    const e = this.environment;
    return [
      `- runtime: ${e.runtime ?? e.runtimeVersion ?? 'unknown'}`,
      `- os: ${e.os ?? 'unknown'}`,
      `- machine: ${e.machine ?? 'unknown'}`,
      `- hardwareConcurrency: ${e.hardwareConcurrency ?? 'unknown'}`,
    ].join('\n');
  }
}
