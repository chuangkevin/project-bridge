import type { ApiEndpoint } from './dataBinding';

export type EventName = 'click' | 'submit' | 'change' | 'input' | 'focus' | 'blur' | 'mount' | 'unmount';

export type Action =
  | { kind: 'navigate'; to: string }
  | { kind: 'api'; endpoint: ApiEndpoint; payloadFromState?: string }
  | { kind: 'setState'; path: string; valueFromEvent?: boolean; staticValue?: unknown }
  | { kind: 'openModal'; modalId: string }
  | { kind: 'closeModal'; modalId?: string }
  | { kind: 'custom'; name: string; args?: Record<string, unknown> };

export interface EventBinding {
  event: EventName;
  action: Action;
  next?: Action;
}
