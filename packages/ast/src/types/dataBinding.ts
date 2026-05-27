export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  queryFromState?: Record<string, string>;
  bodyFromState?: string;
}
export type BindingSource = 'state' | 'api' | 'static' | 'computed';
export interface DataBinding {
  propKey: string;
  source: BindingSource;
  path?: string;
  endpoint?: ApiEndpoint;
  staticValue?: unknown;
  expression?: string;
}
