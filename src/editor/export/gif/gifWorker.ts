/// <reference lib="webworker" />
import { createGifStream, type GifStream } from './gifEncode';
import type { GifWorkerRequest, GifWorkerResponse } from './gifWorkerProtocol';

/**
 * Dedicated GIF encode worker (plan §6.3 / AN-2.4). Keeps the CPU-heavy palette
 * quantization + LZW off the main thread. Frame buffers arrive transferred; the
 * finished GIF is transferred back. `cancel`/error release the stream promptly.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let stream: GifStream | null = null;
let frames = 0;

function post(message: GifWorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(message, transfer ?? []);
}

ctx.onmessage = (event: MessageEvent<GifWorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'init':
        stream = createGifStream({
          width: msg.width,
          height: msg.height,
          frameDelayMs: msg.frameDelayMs,
          repeat: msg.repeat,
        });
        frames = 0;
        break;
      case 'frame': {
        if (!stream) throw new Error('gif worker received frame before init');
        stream.addFrame(new Uint8ClampedArray(msg.data));
        frames += 1;
        post({ type: 'progress', frames });
        break;
      }
      case 'finish': {
        if (!stream) throw new Error('gif worker received finish before init');
        const bytes = stream.finish();
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        stream = null;
        post({ type: 'done', bytes: buffer }, [buffer]);
        break;
      }
      case 'cancel':
        stream = null;
        frames = 0;
        break;
    }
  } catch (err) {
    stream = null;
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
