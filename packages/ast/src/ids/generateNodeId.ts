import { nanoid } from 'nanoid';

export function generateNodeId(): string {
  return `n_${nanoid(10)}`;
}
