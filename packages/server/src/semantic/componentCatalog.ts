import type { ComponentRegistry, PropSpec } from '@designbridge/ast';

function describeProp(name: string, spec: PropSpec): string {
  const bits: string[] = [spec.type];
  if (spec.type === 'enum' && spec.enumValues) bits.push(`one of [${spec.enumValues.join('|')}]`);
  if (spec.required) bits.push('required');
  return `${name} (${bits.join(', ')})`;
}

/** Renders the registry into a compact catalog for the AI system prompt. */
export function describeComponentCatalog(registry: ComponentRegistry): string {
  const lines: string[] = ['Available components (use ONLY these "type" values):'];
  for (const [name, spec] of Object.entries(registry)) {
    const props = Object.entries(spec.props).map(([k, v]) => describeProp(k, v));
    const propText = props.length ? ` props: ${props.join('; ')}.` : ' no constrained props.';
    const childText = spec.allowsChildren ? ' allows children.' : ' leaf — no children.';
    lines.push(`- ${name}:${propText}${childText}`);
  }
  return lines.join('\n');
}
