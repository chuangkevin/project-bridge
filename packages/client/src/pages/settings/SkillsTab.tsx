import { useRef, useState, type ChangeEvent } from 'react';
import { useSkillsAdmin, type GlobalSkill, type ExportedSkill } from '../../hooks/useSkillsAdmin';
import { parseFrontmatter } from '../../lib/frontmatter';

interface PreviewSkill {
  name: string;
  description: string;
  body: string;
  filename?: string;
  isNew: boolean;
}

interface SkillForm {
  name: string;
  description: string;
  body: string;
}

const EMPTY_SKILL: SkillForm = { name: '', description: '', body: '' };

function showsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker === 'function';
}

export default function SkillsTab() {
  const { skills, loading, error, createSingle, remove, exportAll, importBatch } = useSkillsAdmin();
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewSkill[] | null>(null);
  const [importing, setImporting] = useState(false);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const existingNames = new Set(skills.map(s => s.name));

  const toggleSelected = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === skills.length) setSelected(new Set());
    else setSelected(new Set(skills.map(s => s.name)));
  };

  const handleAddSingle = async () => {
    if (!form.name.trim() || !form.description.trim() || !form.body.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await createSingle({ name: form.name.trim(), description: form.description.trim(), body: form.body });
      setForm(EMPTY_SKILL);
      setShowForm(false);
      setFeedback('已新增技能');
    } catch (e) {
      setFeedback(`新增失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`確定刪除技能「${name}」？`)) return;
    try { await remove(name); }
    catch (e) { alert((e as Error).message); }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定刪除選取的 ${selected.size} 個技能？`)) return;
    setBusy(true);
    try {
      for (const name of selected) {
        await remove(name);
      }
      setSelected(new Set());
      setFeedback(`已刪除 ${selected.size} 個技能`);
    } catch (e) {
      setFeedback(`部分刪除失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skills-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback(`已匯出 ${data.skills.length} 個技能`);
    } catch (e) {
      setFeedback(`匯出失敗：${(e as Error).message}`);
    }
  };

  const handleJsonImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = (data.skills ?? data) as ExportedSkill[];
      if (!Array.isArray(arr) || arr.length === 0) {
        alert('JSON 格式錯誤：找不到 skills 陣列');
        return;
      }
      const previewList: PreviewSkill[] = arr
        .filter((s): s is ExportedSkill => typeof s?.name === 'string')
        .map(s => ({
          name: s.name,
          description: s.description ?? '',
          body: s.body ?? '',
          isNew: !existingNames.has(s.name),
        }));
      setPreview(previewList);
    } catch (err) {
      alert(`讀取失敗：${(err as Error).message}`);
    }
  };

  const handleDirectoryImport = async () => {
    if (showsDirectoryPicker()) {
      try {
        // showDirectoryPicker isn't in lib.dom yet across all TS configs
        const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
        const items: PreviewSkill[] = [];
        await scanDirectory(dirHandle, items);
        if (items.length === 0) { alert('沒有找到任何 SKILL.md 或 .md frontmatter 檔'); return; }
        for (const s of items) s.isNew = !existingNames.has(s.name);
        setPreview(items);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        alert(`讀取目錄失敗：${(err as Error).message}`);
      }
    } else {
      dirInputRef.current?.click();
    }
  };

  const handleDirectoryFallback = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    const items: PreviewSkill[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.md')) continue;
      const text = await file.text();
      const parsed = parseFrontmatter(text);
      const name = parsed.data.name ?? file.name.replace(/\.md$/, '');
      const description = parsed.data.description ?? '';
      items.push({
        name,
        description,
        body: parsed.content,
        filename: file.name,
        isNew: !existingNames.has(name),
      });
    }
    if (items.length === 0) { alert('沒有找到任何有效的 .md 檔'); return; }
    setPreview(items);
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const r = await importBatch(preview.map(p => ({
        name: p.name,
        description: p.description,
        body: p.body,
      })));
      setFeedback(`匯入完成：新增 ${r.added}，更新 ${r.updated}`);
      setPreview(null);
    } catch (e) {
      alert(`匯入失敗：${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">技能庫</h2>
          <span className="settings-section__badge">{skills.length} 個</span>
        </header>
        <p className="settings-muted">
          自訂 AI Agent 技能。每個 .md 檔需有 frontmatter（name / description）。
        </p>
        {error && <p className="settings-error">{error}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <button className="settings-btn settings-btn--primary" onClick={() => { setShowForm(true); setForm(EMPTY_SKILL); }}>+ 新增技能</button>
          <button className="settings-btn" onClick={handleDirectoryImport}>從目錄匯入</button>
          <button className="settings-btn" onClick={handleExport}>批次匯出</button>
          <button className="settings-btn" onClick={() => jsonInputRef.current?.click()}>從 JSON 匯入</button>
          <input
            ref={dirInputRef}
            type="file"
            multiple
            // webkitdirectory / directory are non-standard but widely supported on Chromium browsers.
            // TS doesn't know about them, so cast on the JSX attributes block.
            {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, string>)}
            style={{ display: 'none' }}
            onChange={handleDirectoryFallback}
          />
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleJsonImport}
          />
        </div>

        {feedback && <p className="settings-muted" style={{ marginBottom: 'var(--space-3)' }}>{feedback}</p>}

        {showForm && (
          <div className="settings-form">
            <div className="setting-row">
              <label>名稱 (lowercase-with-dashes)</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：tw-localization" />
            </div>
            <div className="setting-row">
              <label>說明</label>
              <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="一句話描述這個技能的用途" />
            </div>
            <div className="setting-row">
              <label>內容（Markdown）</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                rows={8}
                placeholder={'生成的 UI 必須符合以下規範：\n- 使用繁體中文\n- 貨幣格式為 NT$\n- 日期格式為 YYYY/MM/DD'}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="settings-btn settings-btn--primary" onClick={handleAddSingle} disabled={busy || !form.name || !form.description || !form.body}>
                {busy ? '新增中…' : '新增'}
              </button>
              <button className="settings-btn" onClick={() => { setShowForm(false); setForm(EMPTY_SKILL); }}>取消</button>
            </div>
          </div>
        )}

        {selected.size > 0 && (
          <div className="settings-batch-bar">
            <span>已選 {selected.size} / {skills.length}</span>
            <button className="settings-btn settings-btn--danger" onClick={handleBatchDelete} disabled={busy}>
              刪除選取
            </button>
            <button className="settings-btn" onClick={() => setSelected(new Set())}>取消選取</button>
          </div>
        )}

        {loading ? <p className="settings-muted">載入中…</p>
          : skills.length === 0 ? <p className="settings-muted">尚未建立任何技能</p>
          : (
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === skills.length && skills.length > 0}
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < skills.length; }}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>名稱</th>
                    <th>說明</th>
                    <th>範圍</th>
                    <th className="settings-table__actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s: GlobalSkill) => (
                    <tr key={s.name}>
                      <td><input type="checkbox" checked={selected.has(s.name)} onChange={() => toggleSelected(s.name)} /></td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="settings-muted">{s.description}</td>
                      <td><span className="settings-status">{s.layer ?? 'global'}</span></td>
                      <td className="settings-table__actions">
                        <button className="settings-btn settings-btn--danger" onClick={() => handleDelete(s.name)}>刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {preview && (
        <div className="settings-modal-backdrop" onClick={() => !importing && setPreview(null)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 'var(--space-3)' }}>匯入預覽 — {preview.length} 個技能</h3>
            <div className="settings-table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>檔名</th>
                    <th>名稱</th>
                    <th>說明</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={`${p.name}-${i}`}>
                      <td className="settings-muted" style={{ fontSize: 12 }}>{p.filename ?? '-'}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="settings-muted">{p.description || '—'}</td>
                      <td>
                        <span className={p.isNew ? 'settings-status settings-status--active' : 'settings-status'}>
                          {p.isNew ? '新增' : '更新'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button className="settings-btn" onClick={() => setPreview(null)} disabled={importing}>取消</button>
              <button className="settings-btn settings-btn--primary" onClick={handleConfirmImport} disabled={importing}>
                {importing ? '匯入中…' : `確認匯入 (${preview.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function scanDirectory(handle: FileSystemDirectoryHandle, items: PreviewSkill[], depth = 0): Promise<void> {
  if (depth > 4) return; // safety cap
  for await (const [name, entry] of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (entry.kind === 'file') {
      if (!name.endsWith('.md')) continue;
      // Prefer SKILL.md; otherwise accept any .md with frontmatter
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const text = await file.text();
      const parsed = parseFrontmatter(text);
      if (!parsed.data.name && name !== 'SKILL.md') continue;
      const skillName = parsed.data.name ?? handle.name;
      const description = parsed.data.description ?? '';
      items.push({ name: skillName, description, body: parsed.content, filename: name, isNew: true });
    } else if (entry.kind === 'directory') {
      await scanDirectory(entry as FileSystemDirectoryHandle, items, depth + 1);
    }
  }
}
