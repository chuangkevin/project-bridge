import type { Response } from 'express';

/**
 * Wraps a long-running response so reverse proxies (e.g. nginx with
 * proxy_read_timeout 60s) don't cut the connection while the AI works.
 *
 * Strategy: stream JSON-whitespace heartbeats every `intervalMs` until the
 * final JSON body is written. Leading whitespace is valid JSON, so the
 * client's JSON.parse still works.
 *
 * Caller pattern:
 *   const ka = startJsonKeepalive(res);
 *   try {
 *     const result = await longWork();
 *     endJsonKeepalive(res, ka, result);
 *   } catch (err) {
 *     if (!res.headersSent) res.status(500);
 *     endJsonKeepalive(res, ka, { error: (err as Error).message });
 *   }
 *
 * Falls back to `res.json()` when the response doesn't support streaming
 * (e.g. unit-test mocks that only stub status/json).
 */
export interface KeepaliveHandle {
  timer: NodeJS.Timeout | null;
  streaming: boolean;
}

function isStreamable(res: Response): boolean {
  return typeof res.setHeader === 'function'
    && typeof (res as { write?: unknown }).write === 'function'
    && typeof (res as { end?: unknown }).end === 'function';
}

export function startJsonKeepalive(res: Response, intervalMs = 15_000): KeepaliveHandle {
  if (!isStreamable(res)) {
    return { timer: null, streaming: false };
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Tell nginx not to buffer this response so heartbeats actually traverse the proxy.
  res.setHeader('X-Accel-Buffering', 'no');
  const timer = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(' ');
      } catch {
        // socket gone — caller will discover when calling endJsonKeepalive
      }
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { timer, streaming: true };
}

export function endJsonKeepalive(res: Response, ka: KeepaliveHandle, data: unknown): void {
  if (ka.timer) clearInterval(ka.timer);
  if (!ka.streaming) {
    // Mock / non-streaming response — defer to res.json()
    res.json(data);
    return;
  }
  if (res.writableEnded) return;
  try {
    res.write(JSON.stringify(data));
    res.end();
  } catch {
    // socket already closed — nothing else we can do
  }
}
