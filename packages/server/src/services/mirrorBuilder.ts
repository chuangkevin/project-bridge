import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { parseWebpage, type ParseWebpageReason } from '../ingestion/parseWebpage';
import { writeMirrorFiles, saveMirrorMeta, type MirrorArtifactMeta } from '../storage/mirrorStore';

export interface BuildMirrorParams {
  projectId: string;
  artifactId: string;
  url: string;
  baseDir?: string;
  /** Bounded asset-fetch concurrency. Default 6. */
  concurrency?: number;
}

export type BuildMirrorResult =
  | { ok: true; meta: MirrorArtifactMeta }
  | { ok: false; reason: ParseWebpageReason | 'asset_write_failed'; detail?: string };

interface DownloadedAsset { originalUrl: string; localFilename: string; bytes: Buffer; }
interface AssetFailure { url: string; code: 'asset_404' | 'asset_error'; detail?: string; }

function extFromUrl(u: string): string {
  try {
    const p = new URL(u).pathname;
    const e = extname(p).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(e) ? e : '.bin';
  } catch {
    return '.bin';
  }
}

async function fetchAsset(url: string): Promise<
  | { ok: true; bytes: Buffer }
  | { ok: false; code: 'asset_404' | 'asset_error'; detail?: string }
> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, code: r.status === 404 ? 'asset_404' : 'asset_error', detail: `status ${r.status}` };
    const ab = await r.arrayBuffer();
    return { ok: true, bytes: Buffer.from(ab) };
  } catch (err) {
    return { ok: false, code: 'asset_error', detail: (err as Error).message };
  }
}

async function downloadAll(
  urls: string[],
  concurrency: number,
): Promise<{ ok: DownloadedAsset[]; failed: AssetFailure[] }> {
  const ok: DownloadedAsset[] = [];
  const failed: AssetFailure[] = [];
  if (urls.length === 0) return { ok, failed };
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const r = await fetchAsset(url);
      if (r.ok) {
        const hash = createHash('sha1').update(r.bytes).digest('hex').slice(0, 16);
        ok.push({ originalUrl: url, localFilename: `${hash}${extFromUrl(url)}`, bytes: r.bytes });
      } else {
        failed.push({ url, code: r.code, detail: r.detail });
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

function rewriteUrls(html: string, css: string, mapping: Map<string, string>): { html: string; css: string } {
  let rewrittenHtml = html;
  let rewrittenCss = css;
  for (const [orig, local] of mapping) {
    const safe = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewrittenHtml = rewrittenHtml.replace(new RegExp(safe, 'g'), `assets/${local}`);
    rewrittenCss = rewrittenCss.replace(new RegExp(safe, 'g'), `assets/${local}`);
  }
  return { html: rewrittenHtml, css: rewrittenCss };
}

export async function buildMirror(params: BuildMirrorParams): Promise<BuildMirrorResult> {
  const parsed = await parseWebpage(params.url);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, detail: parsed.detail };

  const { ok: assets, failed } = await downloadAll(parsed.assets, params.concurrency ?? 6);
  const mapping = new Map(assets.map(a => [a.originalUrl, a.localFilename]));

  // Concat downloaded CSS assets so the served styles.css already includes them.
  const cssParts: string[] = [];
  for (const a of assets) {
    if (a.localFilename.endsWith('.css')) cssParts.push(a.bytes.toString('utf8'));
  }
  const css = cssParts.join('\n\n');

  const rewritten = rewriteUrls(parsed.ingestion.dom, css, mapping);

  const meta: MirrorArtifactMeta = {
    kind: 'mirror',
    id: params.artifactId,
    sourceUrl: parsed.ingestion.url,
    sourceType: 'url',
    crawledAt: new Date().toISOString(),
    files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
    warnings: failed.map(f => ({ code: f.code, url: f.url, detail: f.detail })),
    editable: false,
  };

  try {
    writeMirrorFiles(params.projectId, params.artifactId, {
      html: rewritten.html,
      css: rewritten.css,
      screenshot: Buffer.from(parsed.ingestion.screenshot ?? '', 'base64'),
      assets: assets.map(a => ({ filename: a.localFilename, bytes: a.bytes })),
    }, { baseDir: params.baseDir });
    saveMirrorMeta(params.projectId, meta, { baseDir: params.baseDir });
  } catch (err) {
    return { ok: false, reason: 'asset_write_failed', detail: (err as Error).message };
  }

  return { ok: true, meta };
}
