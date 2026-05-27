import { describe, it, expect } from 'vitest';
import { describeComponentCatalog } from '../componentCatalog';
import { BASE_COMPONENTS } from '@designbridge/ast';

describe('describeComponentCatalog', () => {
  const text = describeComponentCatalog(BASE_COMPONENTS);

  it('lists every registered component type', () => {
    for (const name of Object.keys(BASE_COMPONENTS)) expect(text).toContain(name);
  });
  it('marks required props and enum options', () => {
    expect(text).toMatch(/Heading[\s\S]*content[\s\S]*required/i);
    expect(text).toMatch(/level[\s\S]*1\|2\|3\|4\|5\|6|1, 2, 3, 4, 5, 6/);
  });
  it('notes which components allow children', () => {
    expect(text).toMatch(/Container[\s\S]*children/i);
    expect(text).toMatch(/Image[\s\S]*no children|Image[\s\S]*leaf/i);
  });
});
