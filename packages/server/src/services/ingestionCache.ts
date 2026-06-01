import type { WebpageIngestion } from '@designbridge/ast';

interface CachedEntry {
  ingestion: WebpageIngestion;
  assets: string[];
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, CachedEntry>();

function key(projectId: string, url: string): string {
  return `${projectId}::${url}`;
}

export const ingestionCache = {
  get(projectId: string, url: string): { ingestion: WebpageIngestion; assets: string[] } | undefined {
    const e = store.get(key(projectId, url));
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { store.delete(key(projectId, url)); return undefined; }
    return { ingestion: e.ingestion, assets: e.assets };
  },
  set(projectId: string, url: string, ingestion: WebpageIngestion, extras: { assets: string[] }): void {
    store.set(key(projectId, url), { ingestion, assets: extras.assets, expiresAt: Date.now() + TTL_MS });
  },
  clear(): void {
    store.clear();
  },
};
