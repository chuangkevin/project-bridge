import { describe, it, expect } from 'vitest';
import { renderNode } from '../renderNode';
import type { ComponentNode } from '@designbridge/ast';

const n = (type: string, props: Record<string, unknown> = {}, children: ComponentNode[] = []): ComponentNode => ({
  id: 'n', type, props, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children,
});

describe('renderNode', () => {
  it('Text → escaped span', () => { expect(renderNode(n('Text', { content: 'a < b & c' }), 0)).toContain('<span>a &lt; b &amp; c</span>'); });
  it('Heading → h{level}', () => {
    expect(renderNode(n('Heading', { content: 'Title', level: '3' }), 0)).toContain('<h3>Title</h3>');
    expect(renderNode(n('Heading', { content: 'Default' }), 0)).toContain('<h2>Default</h2>');
  });
  it('Button → button with escaped label', () => { expect(renderNode(n('Button', { label: 'Go"' }), 0)).toContain('<button type="button">Go"</button>'); });
  it('Image → self-closing img', () => {
    const out = renderNode(n('Image', { src: '/x.png', alt: 'pic' }), 0);
    expect(out).toContain('<img'); expect(out).toContain('src="/x.png"'); expect(out).toContain('alt="pic"');
  });
  it('Input → input with type + placeholder', () => {
    const out = renderNode(n('Input', { inputType: 'email', placeholder: 'Email' }), 0);
    expect(out).toContain('<input'); expect(out).toContain('type="email"'); expect(out).toContain('placeholder="Email"');
  });
  it('Input defaults type to text', () => { expect(renderNode(n('Input', {}), 0)).toContain('type="text"'); });
  it('Link → anchor with href', () => { expect(renderNode(n('Link', { label: 'Home', href: '/' }), 0)).toContain('<a href="/">Home</a>'); });
  it('Select → select with options', () => {
    const out = renderNode(n('Select', { options: ['A', 'B'] }), 0);
    expect(out).toContain('<select'); expect(out).toContain('<option>A</option>'); expect(out).toContain('<option>B</option>');
  });
  it('Container renders children recursively', () => {
    const out = renderNode(n('Container', {}, [ n('Text', { content: 'hi' }) ]), 0);
    expect(out).toContain('<div'); expect(out).toContain('<span>hi</span>');
  });
  it('Form → form element', () => { expect(renderNode(n('Form', {}, [ n('Button', { label: 'Submit' }) ]), 0)).toMatch(/<form[\s\S]*<button/); });
  it('Table → table with headers and rows', () => {
    const out = renderNode(n('Table', { columns: ['Name', 'Age'], rows: [['Al', '30']] }), 0);
    expect(out).toContain('<table'); expect(out).toContain('<th>Name</th>'); expect(out).toContain('<th>Age</th>');
    expect(out).toContain('<td>Al</td>'); expect(out).toContain('<td>30</td>');
  });
  it('unknown type → div with data-unknown attr', () => { expect(renderNode(n('NotReal', {}), 0)).toContain('data-unknown-type="NotReal"'); });
  it('applies layout+style classes', () => {
    const node: ComponentNode = { ...n('Container'), layout: { kind: 'stack', direction: 'vertical' }, style: { padding: 8 } };
    expect(renderNode(node, 0)).toContain('class="flex flex-col p-[8px]"');
  });
  it('escapes Checkbox/Radio/Textarea/FormField/Card/Modal/Icon content + attrs', () => {
    expect(renderNode(n('Checkbox', { label: 'Agree' }), 0)).toContain('type="checkbox"');
    expect(renderNode(n('Radio', { options: ['x'] }), 0)).toContain('type="radio"');
    expect(renderNode(n('Textarea', { placeholder: 'Notes' }), 0)).toContain('<textarea');
    expect(renderNode(n('FormField', { label: 'Email' }, [ n('Input') ]), 0)).toMatch(/<label>Email<\/label>[\s\S]*<input/);
    expect(renderNode(n('Card', { title: 'T' }, []), 0)).toContain('<h3>T</h3>');
    expect(renderNode(n('Modal', { title: 'M' }, []), 0)).toContain('role="dialog"');
    expect(renderNode(n('Icon', { name: 'star' }), 0)).toContain('data-icon="star"');
  });
});
