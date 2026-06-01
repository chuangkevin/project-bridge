import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import { startSseKeepalive, stopSseKeepalive } from '../sseKeepalive';

interface FakeRes {
  writes: string[];
  writableEnded: boolean;
  write: (s: string) => void;
  end: () => void;
}
function fakeRes(): FakeRes {
  const r: FakeRes = {
    writes: [],
    writableEnded: false,
    write(s) { if (!r.writableEnded) r.writes.push(s); },
    end() { r.writableEnded = true; },
  };
  return r;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sseKeepalive', () => {
  it('writes ": heartbeat\\n\\n" every interval', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(3500);
    expect(res.writes.filter(w => w === ': heartbeat\n\n').length).toBe(3);
    stopSseKeepalive(h);
  });
  it('stops writing after stopSseKeepalive', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(1500);
    stopSseKeepalive(h);
    vi.advanceTimersByTime(5000);
    expect(res.writes.length).toBe(1);
  });
  it('stops writing after res.end() (writableEnded becomes true)', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(1500);
    res.end();
    vi.advanceTimersByTime(5000);
    expect(res.writes.length).toBe(1);
    stopSseKeepalive(h);
  });
});
