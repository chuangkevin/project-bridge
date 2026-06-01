import type { Response } from 'express';

export interface KeepaliveHandle { timer: NodeJS.Timeout; }

export function startSseKeepalive(res: Response, intervalMs = 15_000): KeepaliveHandle {
  const timer = setInterval(() => {
    if ((res as unknown as { writableEnded?: boolean }).writableEnded) return;
    try { res.write(': heartbeat\n\n'); } catch { /* socket gone */ }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { timer };
}

export function stopSseKeepalive(handle: KeepaliveHandle): void {
  clearInterval(handle.timer);
}
