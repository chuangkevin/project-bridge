import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/visionProvider', () => {
  class VisionUnavailableError extends Error {
    constructor(reason: string) { super(`vision_unavailable: ${reason}`); this.name = 'VisionUnavailableError'; }
  }
  return { generateVision: vi.fn(), VisionUnavailableError };
});

import { parseScreenshot } from '../parseScreenshot';
import { generateVision, VisionUnavailableError } from '../../services/visionProvider';

const genMock = generateVision as ReturnType<typeof vi.fn>;

describe('parseScreenshot', () => {
  beforeEach(() => { genMock.mockReset(); });

  it('returns ScreenshotIngestion with ocrText + regions from vision JSON', async () => {
    genMock.mockResolvedValueOnce(JSON.stringify({
      ocrText: 'Welcome to FooApp\nPricing\nGet started',
      regions: [
        { x: 0, y: 0, width: 1200, height: 80, text: 'Header' },
        { x: 0, y: 100, width: 1200, height: 500, text: 'Hero' },
      ],
    }));
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ingestion.type).toBe('screenshot');
    expect(r.ingestion.ocrText).toContain('FooApp');
    expect(r.ingestion.regions.length).toBe(2);
    expect(r.ingestion.regions[0].text).toBe('Header');
  });

  it('strips markdown json fence around the response', async () => {
    genMock.mockResolvedValueOnce('```json\n{"ocrText": "x", "regions": []}\n```');
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ingestion.ocrText).toBe('x');
  });

  it('returns ok:false parse_failed when vision returns malformed JSON', async () => {
    genMock.mockResolvedValueOnce('definitely not json');
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('parse_failed');
  });

  it('returns ok:false parse_failed when shape is wrong (missing fields)', async () => {
    genMock.mockResolvedValueOnce('{"notWhatWeWant": true}');
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('parse_failed');
  });

  it('returns vision_unavailable when generateVision throws VisionUnavailableError', async () => {
    genMock.mockRejectedValueOnce(new VisionUnavailableError('no_key'));
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('vision_unavailable');
  });
});
