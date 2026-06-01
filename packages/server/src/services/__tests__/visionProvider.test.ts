import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google/generative-ai', () => {
  const generateContent = vi.fn();
  const getGenerativeModel = vi.fn(() => ({ generateContent }));
  return {
    GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel })),
    __mock: { generateContent, getGenerativeModel },
  };
});

vi.mock('../geminiKeys', () => ({
  getGeminiApiKey: vi.fn(() => 'AIzaTESTKEY_PLACEHOLDER_0000000000000'),
  getGeminiModel: vi.fn(() => 'gemini-2.5-flash'),
}));

import { generateVision, VisionUnavailableError } from '../visionProvider';
import * as sdk from '@google/generative-ai';
import * as keys from '../geminiKeys';

const sdkMock = (sdk as unknown as { __mock: { generateContent: ReturnType<typeof vi.fn>; getGenerativeModel: ReturnType<typeof vi.fn> } }).__mock;

describe('generateVision — happy path', () => {
  beforeEach(() => {
    sdkMock.generateContent.mockReset();
    sdkMock.getGenerativeModel.mockClear();
    (keys.getGeminiApiKey as ReturnType<typeof vi.fn>).mockReturnValue('AIzaTESTKEY_PLACEHOLDER_0000000000000');
  });

  it('returns the model text for prompt + 1 image', async () => {
    sdkMock.generateContent.mockResolvedValueOnce({ response: { text: () => 'detected: stripe.com pricing page' } });

    const result = await generateVision({
      prompt: 'identify this page',
      images: [{ mimeType: 'image/png', base64: 'iVBORw0KGgo=' }],
    });

    expect(result).toBe('detected: stripe.com pricing page');
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(1);
    const call = sdkMock.generateContent.mock.calls[0][0];
    expect(call[0]).toEqual({ text: 'identify this page' });
    expect(call[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
  });
});

describe('generateVision — retry on transient errors', () => {
  beforeEach(() => {
    sdkMock.generateContent.mockReset();
    (keys.getGeminiApiKey as ReturnType<typeof vi.fn>).mockReturnValue('AIzaTESTKEY_PLACEHOLDER_0000000000000');
  });

  it('retries once on 429, succeeds on second attempt', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    sdkMock.generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'ok' } });
    const result = await generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] });
    expect(result).toBe('ok');
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(2);
  });

  it('retries on 503, succeeds on second attempt', async () => {
    const err = Object.assign(new Error('service unavailable'), { status: 503 });
    sdkMock.generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'ok' } });
    const result = await generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] });
    expect(result).toBe('ok');
  });

  it('does NOT retry on 401 (auth) and throws immediately', async () => {
    const err = Object.assign(new Error('invalid api key'), { status: 401 });
    sdkMock.generateContent.mockRejectedValueOnce(err);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/invalid api key/i);
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries on persistent 429', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    sdkMock.generateContent.mockRejectedValue(err);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/rate limited/i);
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(2);
  });
});

describe('generateVision — error contract', () => {
  beforeEach(() => {
    sdkMock.generateContent.mockReset();
  });

  it('throws VisionUnavailableError when no Gemini key is configured', async () => {
    (keys.getGeminiApiKey as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/vision_unavailable: no_gemini_key_configured/);
  });

  it('VisionUnavailableError is an instance check works', () => {
    const e = new VisionUnavailableError('test');
    expect(e).toBeInstanceOf(VisionUnavailableError);
    expect(e.name).toBe('VisionUnavailableError');
  });
});
