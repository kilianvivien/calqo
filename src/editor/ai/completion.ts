/** Provider-neutral completion primitives shared by every real backend.
 * Feature services (templates, design edits, copy tools, translation) build a
 * `CompletionRequest`; each provider maps it onto its own wire format. */

/** An image the model should look at (style reference, artboard preview). */
export interface CompletionImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Base64 payload without a `data:` prefix. */
  data: string;
}

/** A JSON Schema the response should conform to. Providers that cannot
 * constrain output fall back to plain JSON mode, so callers must still
 * validate the parsed result. */
export interface JsonOutputSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompletionProgress {
  /** Characters of answer text received so far. */
  receivedChars: number;
  /** True while the model is still reasoning and has produced no answer. */
  reasoning: boolean;
}

export interface CompletionRequest {
  system: string;
  user: string;
  images?: CompletionImage[];
  /** `json` asks for a JSON object; `text` leaves the output unconstrained. */
  format: 'json' | 'text';
  /** Optional schema for `json` requests. */
  schema?: JsonOutputSchema;
  signal?: AbortSignal;
  onProgress?: (progress: CompletionProgress) => void;
}

export interface CompletionResult {
  text: string;
  /** Capabilities the provider had to drop to get an answer (e.g. the model
   * rejected image input), surfaced as diagnostics warnings. */
  downgrades: string[];
}

/** Streaming requests have no fixed deadline: slow reasoning models may take
 * minutes. They are cut off only after this long without receiving a byte. */
export const STREAM_IDLE_TIMEOUT_MS = 90_000;
/** Absolute ceiling for any single completion. */
export const COMPLETION_HARD_TIMEOUT_MS = 10 * 60_000;

export class CompletionTimeoutError extends Error {
  constructor(label: string, kind: 'idle' | 'total', ms: number) {
    super(
      kind === 'idle'
        ? `${label} stopped responding for ${Math.round(ms / 1000)}s.`
        : `${label} timed out after ${Math.round(ms / 1000)}s.`,
    );
    this.name = 'CompletionTimeoutError';
  }
}

export interface Deadline {
  signal: AbortSignal;
  /** The timeout to report if the deadline fired, or null (caller abort). */
  timeoutError: (label: string) => CompletionTimeoutError | null;
  /** Push the idle timer back; call whenever bytes arrive. */
  touch: () => void;
  /** Why the deadline fired, or null when the caller aborted / still running. */
  expired: () => 'idle' | 'total' | null;
  dispose: () => void;
}

/** Combine the caller's abort signal with an idle timer and a hard ceiling. */
export function createDeadline(
  signal: AbortSignal | undefined,
  idleMs = STREAM_IDLE_TIMEOUT_MS,
  totalMs = COMPLETION_HARD_TIMEOUT_MS,
): Deadline {
  const controller = new AbortController();
  let reason: 'idle' | 'total' | null = null;
  const fire = (kind: 'idle' | 'total') => {
    if (reason === null) reason = kind;
    controller.abort();
  };
  let idle = setTimeout(() => fire('idle'), idleMs);
  const total = setTimeout(() => fire('total'), totalMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    touch: () => {
      clearTimeout(idle);
      idle = setTimeout(() => fire('idle'), idleMs);
    },
    expired: () => reason,
    timeoutError: (label) =>
      reason
        ? new CompletionTimeoutError(
            label,
            reason,
            reason === 'idle' ? idleMs : totalMs,
          )
        : null,
    dispose: () => {
      clearTimeout(idle);
      clearTimeout(total);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** Iterate the `data:` payloads of a server-sent-event response body. */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  onBytes?: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = function* (final: boolean): Generator<string> {
    for (;;) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) break;
      const event = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = eventData(event);
      if (data !== null) yield data;
    }
    if (final && buffer.trim()) {
      const data = eventData(buffer);
      buffer = '';
      if (data !== null) yield data;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes?.();
      buffer += decoder.decode(value, { stream: true });
      yield* flush(false);
    }
    buffer += decoder.decode();
    yield* flush(true);
  } finally {
    reader.releaseLock();
  }
}

function eventData(event: string): string | null {
  const lines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}

/** Drop inline reasoning some local/open models emit ahead of the answer
 * (`<think>…</think>`), including an unterminated leading block. */
export function stripReasoning(text: string): string {
  const stripped = text.replace(
    /<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi,
    '',
  );
  const open = stripped.match(/<(think|thinking|reasoning)>/i);
  if (open?.index !== undefined && !stripped.slice(0, open.index).trim()) {
    return '';
  }
  return stripped.trim();
}

/** Split a `data:` URL into the pieces a `CompletionImage` needs. */
export function imageFromDataUrl(dataUrl: string): CompletionImage | null {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return null;
  return { mimeType: match[1] as CompletionImage['mimeType'], data: match[2] };
}

export function imageToDataUrl(image: CompletionImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}
