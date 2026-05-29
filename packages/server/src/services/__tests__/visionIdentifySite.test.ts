import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../visionProvider', () => {
  class VisionUnavailableError extends Error {
    constructor(reason: string) { super(`vision_unavailable: ${reason}`); this.name = 'VisionUnavailableError'; }
  }
  return {
    generateVision: vi.fn(),
    VisionUnavailableError,
  };
});

import { identifySite } from '../visionIdentifySite';
import { generateVision, VisionUnavailableError } from '../visionProvider';

const genMock = generateVision as ReturnType<typeof vi.fn>;

describe('identifySite', () => {
  beforeEach(() => { genMock.mockReset(); });

  it('returns a URL when the model responds with one', async () => {
    genMock.mockResolvedValueOnce('https://stripe.com/pricing');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: true, url: 'https://stripe.com/pricing' });
  });

  it('returns ok:false unknown_site when model says "unknown"', async () => {
    genMock.mockResolvedValueOnce('unknown');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'unknown_site' });
  });

  it('returns vision_unavailable when generateVision throws VisionUnavailableError', async () => {
    genMock.mockRejectedValueOnce(new VisionUnavailableError('no_gemini_key'));
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'vision_unavailable' });
  });

  it('strips quotes / whitespace around the URL', async () => {
    genMock.mockResolvedValueOnce('  "https://example.com"  \n');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: true, url: 'https://example.com' });
  });

  it('rejects non-URL responses as unknown', async () => {
    genMock.mockResolvedValueOnce('this looks like a SaaS pricing page');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'unknown_site' });
  });

  it('treats arbitrary thrown errors as vision_unavailable (defensive)', async () => {
    genMock.mockRejectedValueOnce(new Error('network'));
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'vision_unavailable' });
  });
});
