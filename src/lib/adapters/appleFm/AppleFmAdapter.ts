export type AppleFmModelState =
  | 'available'
  | 'not_eligible'
  | 'intelligence_off'
  | 'not_ready'
  | 'unknown';

export interface AppleFmPreflight {
  installed: boolean;
  osOk: boolean;
  licensed: boolean;
  model: AppleFmModelState;
  detail: string | null;
}

export interface AppleFmStatus {
  running: boolean;
  port: number | null;
  /** False when Calqo reused a healthy server it did not launch. */
  managed: boolean;
  error: string | null;
}

export interface AppleFmChatRequest {
  requestId: string;
  url: string;
  payload: unknown;
  timeoutMs?: number;
}

export interface AppleFmChatResponse {
  status: number;
  body: string;
  retryAfter: string | null;
}

export interface AppleFmAdapter {
  preflight(): Promise<AppleFmPreflight>;
  start(port?: number): Promise<number>;
  stop(): Promise<void>;
  status(): Promise<AppleFmStatus>;
  countTokens(text: string): Promise<number>;
  chat(request: AppleFmChatRequest): Promise<AppleFmChatResponse>;
  cancelChat(requestId: string): Promise<void>;
}
