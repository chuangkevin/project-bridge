import { describe, it, expect } from 'vitest';
import { generateNodeId } from '../ids/generateNodeId';

describe('generateNodeId', () => {
  it('returns a string starting with "n_"', () => {
    const id = generateNodeId();
    expect(id).toMatch(/^n_[A-Za-z0-9_-]{8,}$/);
  });
  it('returns unique ids across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateNodeId());
    expect(ids.size).toBe(1000);
  });
});
