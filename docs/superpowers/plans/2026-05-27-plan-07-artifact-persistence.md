# Plan 7 — Artifact Persistence (file-based, validated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Persist Semantic UI AST artifacts as **files on disk** (git-friendly, deterministic JSON), so a compiled workspace survives reload and is diff/PR-able — while SQLite keeps project metadata (spec §6.1 hybrid). Wire the compile route to save artifacts and add list/load endpoints. Validation on load via `@designbridge/ast`.

**Architecture:** A pure-ish `packages/server/src/storage/artifactStore.ts`: `saveArtifact / loadArtifact / listArtifacts / deleteArtifact`, storing each artifact at `<dataDir>/projects/<projectId>/artifacts/<artifactId>.ast.json` using `toJson` (deterministic) on save and `fromJson` (validating) on load. The base dir is injectable for testing (default = the server's `data/` dir, sibling to `bridge.db`). `artifactId`/`projectId` are sanitized to a safe slug (no path traversal). The compile service/route persists the AST after each compile/mutate; new GET routes list + load artifacts. Listing is derived from the filesystem (no new SQLite table). Git-repo automation (spec §6.10) is explicitly **deferred** — the deterministic file layout is the git-ready foundation; auto-commit is a later phase.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, `@designbridge/ast` (`toJson`/`fromJson`/`BASE_COMPONENTS`/`SemanticUIAst`), node `fs`/`path`. No new deps.

**Spec:** §6.1 (hybrid persistence), §6.10 (git — foundation only here). Builds on Plan 1 (serialize) + Plan 6a (compile route).

**Scope boundary (out of plan):** NO git-repo-per-project automation / auto-commit (deferred — deterministic JSON is the foundation). NO per-project SQLite (central `bridge.db` keeps metadata). NO migration of legacy `prototype_versions(html)` → AST (old HTML has no AST equivalent; legacy rows are left as-is). NO client UI changes (the store already holds artifacts; wiring load-on-open is a small follow-up, not this plan). NO PDF-upload-to-ingestion wiring (separate).

---

## File Structure
```
packages/server/src/storage/
  artifactStore.ts          ← save/load/list/delete + slug sanitize (DI base dir)
  __tests__/artifactStore.test.ts
packages/server/src/services/compile.ts   ← + optional persist after compile/mutate
packages/server/src/routes/compile.ts      ← + GET /:id/artifacts, GET /:id/artifacts/:artifactId
packages/server/src/routes/__tests__/compile.route.test.ts  ← + list/load handler tests
```

---

## Task 1: `artifactStore.ts`

**Files:** Create `packages/server/src/storage/artifactStore.ts` + `__tests__/artifactStore.test.ts`.

- [ ] **Step 1: failing test** (DI a temp base dir; round-trip, list, sanitize, validation, missing)

```typescript
// packages/server/src/storage/__tests__/artifactStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveArtifact, loadArtifact, listArtifacts, deleteArtifact } from '../artifactStore';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'astore-')); });
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

const ast = (artifactId: string): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId, kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('artifactStore', () => {
  it('saves and loads an artifact (round-trip)', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    const loaded = loadArtifact('proj1', 'home', { baseDir });
    expect(loaded?.artifactId).toBe('home');
    expect(loaded?.root.type).toBe('Container');
  });

  it('returns null for a missing artifact', () => {
    expect(loadArtifact('proj1', 'nope', { baseDir })).toBeNull();
  });

  it('lists artifact ids for a project', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    saveArtifact('proj1', ast('list-page'), { baseDir });
    expect(listArtifacts('proj1', { baseDir }).sort()).toEqual(['home', 'list-page']);
  });

  it('lists empty for an unknown project', () => {
    expect(listArtifacts('ghost', { baseDir })).toEqual([]);
  });

  it('deletes an artifact', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    deleteArtifact('proj1', 'home', { baseDir });
    expect(loadArtifact('proj1', 'home', { baseDir })).toBeNull();
  });

  it('sanitizes ids to prevent path traversal', () => {
    saveArtifact('../../evil', ast('..\\..\\escape'), { baseDir });
    // nothing escapes baseDir; the sanitized names round-trip within baseDir
    const ids = listArtifacts('______evil'.replace(/_+/, '..').length ? sanitizeProbe() : 'x', { baseDir });
    // simpler: re-load using the SAME raw inputs resolves to the sanitized location
    expect(loadArtifact('../../evil', '..\\..\\escape', { baseDir })).not.toBeNull();
  });

  it('writes deterministic JSON (stable across saves)', () => {
    saveArtifact('p', ast('a'), { baseDir });
    const first = loadArtifact('p', 'a', { baseDir });
    saveArtifact('p', ast('a'), { baseDir });
    const second = loadArtifact('p', 'a', { baseDir });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

function sanitizeProbe(): string { return 'x'; }
```

> NOTE to implementer: the path-traversal test above is awkwardly written — REPLACE that single test with a clean one that asserts (a) saving with `projectId='../../evil'` + `artifactId='../escape'` creates files strictly INSIDE `baseDir` (assert via `fs` that no file exists outside baseDir, or that the resolved path starts with baseDir), and (b) the same raw ids load back. Keep the intent: sanitize so no traversal escapes `baseDir`.

- [ ] **Step 2: run → FAIL.** `pnpm --filter server test`
- [ ] **Step 3: implement `artifactStore.ts`**

```typescript
// packages/server/src/storage/artifactStore.ts
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toJson, fromJson, BASE_COMPONENTS, type SemanticUIAst } from '@designbridge/ast';

export interface StoreOpts {
  /** Base data dir. Defaults to the server's data/ dir (sibling of bridge.db). */
  baseDir?: string;
}

function defaultBaseDir(): string {
  return resolve(__dirname, '../../data');
}

/** Sanitize an id into a safe single path segment (no traversal, no separators). */
function slug(id: string): string {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 128);
  return s.length ? s : 'unnamed';
}

function artifactsDir(baseDir: string, projectId: string): string {
  return join(baseDir, 'projects', slug(projectId), 'artifacts');
}

function artifactPath(baseDir: string, projectId: string, artifactId: string): string {
  return join(artifactsDir(baseDir, projectId), `${slug(artifactId)}.ast.json`);
}

/** Persist an AST artifact as deterministic JSON. Creates dirs as needed. */
export function saveArtifact(projectId: string, ast: SemanticUIAst, opts: StoreOpts = {}): void {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const dir = artifactsDir(baseDir, projectId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(artifactPath(baseDir, projectId, ast.artifactId), toJson(ast, { pretty: true }), 'utf8');
}

/** Load + validate an artifact, or null if absent. Throws if the file exists but is invalid. */
export function loadArtifact(projectId: string, artifactId: string, opts: StoreOpts = {}): SemanticUIAst | null {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const p = artifactPath(baseDir, projectId, artifactId);
  if (!existsSync(p)) return null;
  return fromJson(readFileSync(p, 'utf8'), { registry: BASE_COMPONENTS });
}

/** List the artifactIds (slugs) stored for a project. */
export function listArtifacts(projectId: string, opts: StoreOpts = {}): string[] {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const dir = artifactsDir(baseDir, projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.ast.json')).map(f => f.replace(/\.ast\.json$/, ''));
}

export function deleteArtifact(projectId: string, artifactId: string, opts: StoreOpts = {}): void {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const p = artifactPath(baseDir, projectId, artifactId);
  if (existsSync(p)) rmSync(p);
}
```

> NOTE: `listArtifacts` returns the SLUG of the stored filename. Since `saveArtifact` uses `slug(ast.artifactId)` for the filename, the listed id is the slug. For the round-trip test where `artifactId` is already a clean slug (`home`, `list-page`), this matches. The "deterministic JSON" test relies on `toJson` stable key order (Plan 1).

- [ ] **Step 4: run → PASS.** Fix the path-traversal test per the NOTE.
- [ ] **Step 5: commit** `feat(server): add file-based artifact store (validated, traversal-safe)`.

---

## Task 2: persist on compile + list/load routes

**Files:** Modify `services/compile.ts`, `routes/compile.ts`, route test.

- [ ] **Step 1: extend `compile.ts`** — add an optional `persist` to the options that, when a `projectId` is given, saves the resulting AST:

```typescript
// in compile.ts — add to CompileOptions/MutationOptions: projectId?: string; persist?: boolean
// and in finish(): if (persist && projectId) saveArtifact(projectId, ast);
```
Concretely: add `projectId?: string` to `CompileOptions` and a shared `persistIfRequested(projectId, ast)` that calls `saveArtifact` when `projectId` is set. Import `saveArtifact` from `../storage/artifactStore`. Default behavior unchanged when no `projectId` (keeps existing tests green).

- [ ] **Step 2: route handlers** — in `routes/compile.ts`, pass `req.params.id` as `projectId` into `compileFromInput`/`compileMutation` so results persist, and add two GET handlers + routes:

```typescript
export function listArtifactsHandler(req: Request, res: Response): void {
  res.json({ artifacts: listArtifacts(req.params.id) });
}
export function loadArtifactHandler(req: Request, res: Response): void {
  const ast = loadArtifact(req.params.id, req.params.artifactId);
  if (!ast) { res.status(404).json({ error: 'artifact not found' }); return; }
  res.json({ ast });
}
// router:
router.get('/:id/artifacts', listArtifactsHandler);
router.get('/:id/artifacts/:artifactId', loadArtifactHandler);
```
(Import `listArtifacts`/`loadArtifact` from `../storage/artifactStore`. Pass `projectId: req.params.id` in the compile/mutate handlers' service calls.)

- [ ] **Step 3: route tests** — add handler tests (mock req/res + a temp baseDir via the service, or spy `artifactStore`): list returns `{artifacts:[…]}`; load returns `{ast}` or 404. Keep existing compile/mutate handler tests green (they don't pass `projectId` persistence in unit tests since the service is spied).

- [ ] **Step 4: run → PASS.** `pnpm --filter server test` — all green (only the pre-existing htmlSanitizer red tolerated).
- [ ] **Step 5: commit** `feat(server): persist artifacts on compile + list/load routes`.

---

## Task 3: Verify

- [ ] `pnpm --filter @designbridge/ast build && pnpm --filter server build` → exit 0.
- [ ] `pnpm --filter server test` → new storage + route suites pass; no NEW failures.
- [ ] Live smoke from repo root (persist + reload round-trip via the real store):
```
node -e "const {saveArtifact,loadArtifact}=require('./packages/server/dist/storage/artifactStore.js'); const {AST_SCHEMA_VERSION}=require('./packages/ast/dist/cjs/index.js'); const a={schemaVersion:AST_SCHEMA_VERSION,artifactId:'home',kind:'page',root:{id:'n_root',type:'Container',props:{},layout:{kind:'flow'},style:{},bindings:[],events:[],constraints:[],children:[]}}; const d=require('os').tmpdir()+'/p7smoke'; saveArtifact('p1',a,{baseDir:d}); console.log('loaded:', loadArtifact('p1','home',{baseDir:d}).artifactId);"
```
Expected: `loaded: home`.
- [ ] `git diff --stat <plan6-head>..HEAD -- packages/client` → EMPTY (no client changes this plan).

---

## Acceptance Criteria
- [ ] `artifactStore` saves deterministic JSON to `<dataDir>/projects/<id>/artifacts/<artifactId>.ast.json`, loads with validation, lists, deletes; ids sanitized (no traversal); base dir injectable.
- [ ] Compile/mutate persist the AST when a `projectId` is provided; `GET /:id/artifacts` + `GET /:id/artifacts/:artifactId` work (404 on missing).
- [ ] All server suites pass; both builds exit 0; live persist/reload smoke prints `loaded: home`.
- [ ] No client changes; no new deps; git auto-commit explicitly deferred.
- [ ] Per-task commits, `feat(server)` convention.

## Compiler Invariant
> Artifacts on disk are **validated AST** (loaded via `fromJson` → `validateAst`) — a corrupt/invalid `*.ast.json` throws on load rather than silently entering the pipeline. Deterministic `toJson` keeps the files diff/PR-friendly (the git-versioning foundation).

---

## Risks / Notes
1. Path-traversal: the `slug()` sanitizer is the safety boundary — never interpolate raw ids into paths. The test must assert nothing escapes `baseDir`.
2. `defaultBaseDir()` resolves to the server's `data/` (sibling of `bridge.db`) so artifacts live alongside metadata; it's gitignored today — for true git-versioning (later phase) the project folder would move to a git-tracked location.
3. Keep existing compile/mutate handler tests green — persistence is opt-in via `projectId`; the service is spied in those tests so no disk I/O occurs there.
4. vitest `^3.2.4`.

---

**Plan end.**
