import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Skill { name: string; description: string; scope?: string; }

export default function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<{ skills: Skill[] }>('/api/skills/global');
      setSkills(r.skills);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const upload = async () => {
    setError(null);
    try {
      await api('/api/skills/global', { method: 'POST', body: JSON.stringify({ name, description, body }) });
      setName(''); setDescription(''); setBody('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const remove = async (n: string) => {
    if (!confirm(`刪除技能 ${n}？`)) return;
    try {
      await api(`/api/skills/global/${encodeURIComponent(n)}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div>
      <div className="skill-upload">
        <h3 style={{ margin: 0, fontSize: 14, marginBottom: 8 }}>新增全域技能</h3>
        <div className="setting-row" style={{ marginBottom: 8 }}>
          <input
            placeholder="skill name (lowercase-with-dashes)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div className="setting-row" style={{ marginBottom: 8 }}>
          <input
            placeholder="一句話描述（description）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <textarea
          placeholder="---&#10;name: my-skill&#10;description: 一句話描述&#10;---&#10;&#10;技能內容…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="setting-row__btn" onClick={upload} disabled={!name || !description || !body}>上傳</button>
        </div>
      </div>

      {error && <div style={{ color: '#fca5a5', marginBottom: 16 }}>{error}</div>}

      <h3 style={{ fontSize: 14, color: 'var(--text-secondary)' }}>已安裝的全域技能</h3>
      {skills.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>尚未上傳任何全域技能</div>}
      {skills.map((s) => (
        <div key={s.name} className="skill-card">
          <div className="skill-card__head">
            <div className="skill-card__name">{s.name}</div>
            <button className="setting-row__btn setting-row__btn--danger" onClick={() => remove(s.name)}>刪除</button>
          </div>
          <div className="skill-card__desc">{s.description}</div>
        </div>
      ))}
    </div>
  );
}
