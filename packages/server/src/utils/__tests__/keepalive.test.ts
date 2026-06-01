import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import { startJsonKeepalive, endJsonKeepalive } from '../keepalive';

interface FakeRes {
  headers: Record<string, string>;
  writes: string[];
  writableEnded: boolean;
  setHeader: (k: string, v: string) => void;
  write: (chunk: string) => void;
  end: () => void;
}

function fakeRes(): FakeRes {
  const r: FakeRes = {
    headers: {},
    writes: [],
    writableEnded: false,
    setHeader(k, v) { r.headers[k] = v; },
    write(chunk) { if (!r.writableEnded) r.writes.push(chunk); },
    end() { r.writableEnded = true; },
  };
  return r;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('startJsonKeepalive', () => {
  it('sets Content-Type and X-Accel-Buffering headers on start', () => {
    const res = fakeRes();
    const ka = startJsonKeepalive(res as unknown as Response, 1000);
    expect(res.headers['Content-Type']).toMatch(/application\/json/);
    expect(res.headers['X-Accel-Buffering']).toBe('no');
    endJsonKeepalive(res as unknown as Response, ka, { ok: true });
  });

  it('writes a heartbeat space every intervalMs', () => {
    const res = fakeRes();
    const ka = startJsonKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(3500);
    // 3 heartbeats fired at 1s/2s/3s
    expect(res.writes.filter((w) => w === ' ').length).toBe(3);
    endJsonKeepalive(res as unknown as Response, ka, { ok: true });
  });

  it('endJsonKeepalive writes JSON body and ends', () => {
    const res = fakeRes();
    const ka = startJsonKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(2000);
    endJsonKeepalive(res as unknown as Response, ka, { ok: true, value: 42 });
    expect(res.writableEnded).toBe(true);
    const final = res.writes.join('');
    expect(final.trim()).toBe('{"ok":true,"value":42}');
    expect(JSON.parse(final)).toEqual({ ok: true, value: 42 });
  });

  it('stops heartbeats after end', () => {
    const res = fakeRes();
    const ka = startJsonKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(1500);
    endJsonKeepalive(res as unknown as Response, ka, { done: true });
    const writesAfterEnd = res.writes.length;
    vi.advanceTimersByTime(5000);
    expect(res.writes.length).toBe(writesAfterEnd);
  });

  it('endJsonKeepalive is a no-op if response already ended', () => {
    const res = fakeRes();
    const ka = startJsonKeepalive(res as unknown as Response, 1000);
    res.writableEnded = true;
    expect(() => endJsonKeepalive(res as unknown as Response, ka, { ok: true })).not.toThrow();
  });
});
