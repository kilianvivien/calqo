/** Typed message protocol for the GIF worker (plan §6.3 / AN-2.4). Frame RGBA
 * buffers are transferred (not copied) both ways. Shared by the worker and its
 * main-thread client. */

export type GifWorkerRequest =
  | { type: 'init'; width: number; height: number; frameDelayMs: number; repeat?: number }
  | { type: 'frame'; data: ArrayBuffer }
  | { type: 'finish' }
  | { type: 'cancel' };

export type GifWorkerResponse =
  | { type: 'progress'; frames: number }
  | { type: 'done'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };
