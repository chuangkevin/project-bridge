import { describe, it, expect } from 'vitest';
import { BASE_COMPONENTS, getComponentSpec, registerComponent } from '../registry/baseComponents';

describe('BASE_COMPONENTS', () => {
  it('exports exactly 20 base components', () => {
    expect(Object.keys(BASE_COMPONENTS)).toHaveLength(20);
  });
  it('includes the 20 documented base set', () => {
    const expected = [
      'Container', 'Stack', 'Row', 'Grid',
      'Text', 'Heading', 'Image', 'Icon',
      'Button', 'Link',
      'Input', 'Textarea', 'Select', 'Checkbox', 'Radio',
      'Form', 'FormField',
      'Card', 'Modal', 'Table',
    ];
    expect(Object.keys(BASE_COMPONENTS).sort()).toEqual(expected.sort());
  });
  it('every component has a name + props schema + allowsChildren', () => {
    for (const [name, spec] of Object.entries(BASE_COMPONENTS)) {
      expect(spec.name).toBe(name);
      expect(spec.props).toBeDefined();
      expect(typeof spec.allowsChildren).toBe('boolean');
    }
  });
  it('Image disallows children; Container allows children', () => {
    expect(BASE_COMPONENTS.Image.allowsChildren).toBe(false);
    expect(BASE_COMPONENTS.Container.allowsChildren).toBe(true);
  });
});

describe('getComponentSpec', () => {
  it('returns spec by name', () => {
    expect(getComponentSpec('Button')?.name).toBe('Button');
  });
  it('returns undefined for unknown', () => {
    expect(getComponentSpec('UnknownXYZ')).toBeUndefined();
  });
});

describe('registerComponent', () => {
  it('adds a project-level component spec', () => {
    const registry = registerComponent({}, { name: 'CustomThing', props: {}, allowsChildren: false });
    expect(registry.CustomThing?.name).toBe('CustomThing');
  });
});
