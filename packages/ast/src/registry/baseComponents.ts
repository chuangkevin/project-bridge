import type { ComponentSpec, ComponentRegistry } from './componentSpec';

export const BASE_COMPONENTS: ComponentRegistry = {
  Container: { name: 'Container', category: 'layout', allowsChildren: true, props: {} },
  Stack:     { name: 'Stack',     category: 'layout', allowsChildren: true, props: {} },
  Row:       { name: 'Row',       category: 'layout', allowsChildren: true, props: {} },
  Grid:      { name: 'Grid',      category: 'layout', allowsChildren: true, props: {} },

  Text:      { name: 'Text',      category: 'display', allowsChildren: false,
    props: { content: { type: 'string', required: true } } },
  Heading:   { name: 'Heading',   category: 'display', allowsChildren: false,
    props: {
      content: { type: 'string', required: true },
      level: { type: 'enum', enumValues: ['1','2','3','4','5','6'] as const },
    } },
  Image:     { name: 'Image',     category: 'display', allowsChildren: false,
    props: { src: { type: 'string', required: true }, alt: { type: 'string' } } },
  Icon:      { name: 'Icon',      category: 'display', allowsChildren: false,
    props: { name: { type: 'string', required: true } } },

  Button:    { name: 'Button',    category: 'action', allowsChildren: false,
    props: {
      label: { type: 'string', required: true },
      variant: { type: 'enum', enumValues: ['primary','secondary','ghost','danger'] as const },
      disabled: { type: 'boolean' },
    } },
  Link:      { name: 'Link',      category: 'action', allowsChildren: false,
    props: { label: { type: 'string', required: true }, href: { type: 'string' } } },

  Input:     { name: 'Input',     category: 'input', allowsChildren: false,
    props: {
      placeholder: { type: 'string' },
      inputType: { type: 'enum', enumValues: ['text','email','password','number','tel','url'] as const },
      value: { type: 'string' },
    } },
  Textarea:  { name: 'Textarea',  category: 'input', allowsChildren: false,
    props: { placeholder: { type: 'string' }, rows: { type: 'number' }, value: { type: 'string' } } },
  Select:    { name: 'Select',    category: 'input', allowsChildren: false,
    props: { options: { type: 'array', required: true }, value: { type: 'string' } } },
  Checkbox:  { name: 'Checkbox',  category: 'input', allowsChildren: false,
    props: { label: { type: 'string' }, checked: { type: 'boolean' } } },
  Radio:     { name: 'Radio',     category: 'input', allowsChildren: false,
    props: { options: { type: 'array', required: true }, value: { type: 'string' } } },

  Form:      { name: 'Form',      category: 'container', allowsChildren: true, props: {} },
  FormField: { name: 'FormField', category: 'container', allowsChildren: true,
    props: { label: { type: 'string' }, required: { type: 'boolean' } } },
  Card:      { name: 'Card',      category: 'container', allowsChildren: true,
    props: { title: { type: 'string' } } },

  Modal:     { name: 'Modal',     category: 'container', allowsChildren: true,
    props: { open: { type: 'boolean' }, title: { type: 'string' } } },
  Table:     { name: 'Table',     category: 'data', allowsChildren: false,
    props: { columns: { type: 'array', required: true }, rows: { type: 'array' } } },
};

export function getComponentSpec(name: string): ComponentSpec | undefined {
  return BASE_COMPONENTS[name];
}

export function registerComponent(registry: ComponentRegistry, spec: ComponentSpec): ComponentRegistry {
  return { ...registry, [spec.name]: spec };
}
