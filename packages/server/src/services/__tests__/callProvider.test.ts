import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProvider, type ProviderCallMeta } from '../callProvider';
import * as providerModule from '../provider';

beforeEach(() => { vi.restoreAllMocks(); });

const SELECTION = { provider: 'opencode', model: 'gemini-2.5-flash', credentialType: 'api', credentialRef: 'opencode-1' };

/** Selection-aware provider mock matching MultiProviderClient's surface. */
function mockProvider(opts: {
  stream?: (params: { systemInstruction?: string }) => AsyncGenerator<string>;
  text?: string;
  selection?: typeof SELECTION;
}) {
  const selection = opts.selection ?? SELECTION;
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamWithSelection: (params: { systemInstruction?: string }) => ({
      selection,
      stream: opts.stream ? opts.stream(params) : (async function* () { yield ''; })(),
    }),
    generateWithSelection: async () => ({ selection, response: { text: opts.text ?? '' } }),
  } as never);
}

describe('callProvider', () => {
  it('streams tokens from the routed stream', async () => {
    mockProvider({ stream: async function* () { yield 'hello '; yield 'world'; } });
    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: true })) out.push(tok);
    expect(out.join('')).toBe('hello world');
  });

  it('non-streaming returns full text in one yield', async () => {
    mockProvider({ text: 'full response' });
    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: false })) out.push(tok);
    expect(out.join('')).toBe('full response');
  });

  it('injects thinking instruction into system prompt', async () => {
    let captured: { systemInstruction?: string } | null = null;
    mockProvider({ stream: (params) => { captured = params; return (async function* () { yield ''; })(); } });
    for await (const _ of callProvider({ mode: 'consult', prompt: 'hi', streaming: true })) { /* drain */ }
    expect(captured?.systemInstruction).toMatch(/thinking/i);
  });

  it('mode-specific system prompt differs between consult / architect / design', async () => {
    const captured: Record<string, string> = {};
    mockProvider({ stream: (params) => { captured.last = params.systemInstruction ?? ''; return (async function* () { yield ''; })(); } });

    for await (const _ of callProvider({ mode: 'consult', prompt: 'x', streaming: true })) { /* drain */ }
    const consultSys = captured.last;
    for await (const _ of callProvider({ mode: 'architect', prompt: 'x', streaming: true })) { /* drain */ }
    const archSys = captured.last;
    for await (const _ of callProvider({ mode: 'design', prompt: 'x', streaming: true })) { /* drain */ }
    const designSys = captured.last;

    expect(consultSys).not.toBe(archSys);
    expect(archSys).not.toBe(designSys);
    expect(consultSys).not.toBe(designSys);
  });

  it('reports serving selection via onMeta (streaming, no fallback)', async () => {
    mockProvider({ stream: async function* () { yield 'x'; } });
    let meta: ProviderCallMeta | null = null;
    for await (const _ of callProvider({
      mode: 'design', prompt: 'x', streaming: true,
      model: 'gemini-2.5-flash',
      onMeta: (m) => { meta = m; },
    })) { /* drain */ }
    expect(meta).not.toBeNull();
    expect(meta!.provider).toBe('opencode');
    expect(meta!.model).toBe('gemini-2.5-flash');
    expect(meta!.fallback).toBe(false);
  });

  it('flags fallback when serving model differs from requested model', async () => {
    mockProvider({ text: 'y', selection: { ...SELECTION, provider: 'gemini', model: 'gemini-2.5-flash' } });
    let meta: ProviderCallMeta | null = null;
    for await (const _ of callProvider({
      mode: 'design', prompt: 'x', streaming: false,
      model: 'gpt-5.5',
      onMeta: (m) => { meta = m; },
    })) { /* drain */ }
    expect(meta!.requestedModel).toBe('gpt-5.5');
    expect(meta!.model).toBe('gemini-2.5-flash');
    expect(meta!.fallback).toBe(true);
  });
});
