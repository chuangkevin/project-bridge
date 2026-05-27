export type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'unknown';

export interface PropSpec {
  type: PropType;
  required?: boolean;
  enumValues?: readonly string[];
  description?: string;
}

export interface ComponentSpec {
  name: string;
  props: Record<string, PropSpec>;
  allowsChildren: boolean;
  category?: 'layout' | 'display' | 'input' | 'action' | 'container' | 'data';
}

export type ComponentRegistry = Record<string, ComponentSpec>;
