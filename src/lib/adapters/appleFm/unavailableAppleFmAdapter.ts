import type { AppleFmAdapter } from './AppleFmAdapter';

const unavailable = () =>
  Promise.reject(
    new Error('Apple Intelligence requires the Calqo macOS app on macOS 27'),
  );

export const unavailableAppleFmAdapter: AppleFmAdapter = {
  async preflight() {
    return {
      installed: false,
      osOk: false,
      licensed: false,
      model: 'unknown',
      detail: null,
    };
  },
  start: unavailable,
  async stop() {},
  async status() {
    return { running: false, port: null, managed: false, error: null };
  },
  countTokens: unavailable,
  chat: unavailable,
  async cancelChat() {},
};
