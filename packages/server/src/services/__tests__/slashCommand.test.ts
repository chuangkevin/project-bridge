import { describe, it, expect } from 'vitest';
import { parseSlashCommand } from '../slashCommand';

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull();
  });

  it('parses /skillname with no args', () => {
    expect(parseSlashCommand('/foo')).toEqual({ skill: 'foo', rest: '' });
  });

  it('parses /skillname with trailing prompt', () => {
    expect(parseSlashCommand('/foo do this')).toEqual({ skill: 'foo', rest: 'do this' });
  });

  it('parses /hpsk:price-doc with colon', () => {
    expect(parseSlashCommand('/hpsk:price-doc 我要做查詢頁')).toEqual({ skill: 'hpsk:price-doc', rest: '我要做查詢頁' });
  });

  it('treats /single-word with hyphens correctly', () => {
    expect(parseSlashCommand('/my-skill arg')).toEqual({ skill: 'my-skill', rest: 'arg' });
  });

  it('returns null when only whitespace after /', () => {
    expect(parseSlashCommand('/  ')).toBeNull();
  });

  it('strips leading newlines/spaces from the input', () => {
    expect(parseSlashCommand('   /foo bar')).toEqual({ skill: 'foo', rest: 'bar' });
  });
});
