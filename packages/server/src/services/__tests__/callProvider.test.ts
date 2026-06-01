import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProvider } from '../callProvider';
import * as providerModule from '../provider';

beforeEach(() => { vi.restoreAllMocks(); });

describe('callProvider', () => {
  it('streams tokens from provider.streamContent', async () => {
    const fakeStream = async function* () { yield 'hello '; yield 'world'; };
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: () => fakeStream(),
      generateContent: vi.fn(),
    } as never);

    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: true })) out.push(tok);
    expect(out.join('')).toBe('hello world');
  });

  it('non-streaming returns full text in one yield', async () => {
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: vi.fn(),
      generateContent: async () => ({ text: 'full response' }),
    } as never);
    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: false })) out.push(tok);
    expect(out.join('')).toBe('full response');
  });

  it('injects thinking instruction into system prompt', async () => {
    let captured: { systemInstruction?: string } | null = null;
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: (params: { systemInstruction?: string }) => {
        captured = params;
        return (async function* () { yield ''; })();
      },
      generateContent: vi.fn(),
    } as never);
    const it1 = callProvider({ mode: 'consult', prompt: 'hi', streaming: true });
    for await (const _ of it1) { /* drain */ }
    expect(captured?.systemInstruction).toMatch(/thinking/i);
  });

  it('mode-specific system prompt differs between consult / architect / design', async () => {
    const captured: Record<string, string> = {};
    vi.spyOn(providerModule, 'getProvider').mockImplementation(() => ({
      streamContent: (params: { systemInstruction?: string }) => {
        // capture for whichever mode is being tested in this call
        captured.last = params.systemInstruction ?? '';
        return (async function* () { yield ''; })();
      },
      generateContent: vi.fn(),
    }) as never);

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
});
