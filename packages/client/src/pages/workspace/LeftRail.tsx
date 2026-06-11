import { useEffect, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';
import { useSocketSync } from '../../hooks/useSocketSync';

interface Turn { id: string; mode: 'consult'|'architect'|'design'; userText: string; createdAt: string; }
interface Fact { id: string; kind: string; text: string; }
interface Skill { name: string; description: string; }

export default function LeftRail() {
  const { projectId, selectedTurnId, selectedFactId, selectedSkillName, selectTurn, selectFact, selectSkill, mobileRailOpen, setMobileRailOpen } = useWorkspaceStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  const load = useCallback(() => {
    if (!projectId) return;
    api<{ turns: Turn[] }>(`/api/projects/${projectId}/turns`).then(r => setTurns(r.turns)).catch(() => {});
    api<{ facts: Fact[] }>(`/api/projects/${projectId}/facts`).then(r => setFacts(r.facts)).catch(() => {});
    api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`).then(r => setSkills(r.skills)).catch(() => {});
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useSocketSync(projectId, { onTurn: load, onFact: load, onArtifact: load });

  return (
    <aside className="workspace__left" onClick={(e) => { if (mobileRailOpen && e.target === e.currentTarget) setMobileRailOpen(false); }}>
      <div className="rail-section">
        <h3>對話</h3>
        {turns.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有對話</div>}
        {turns.map(t => (
          <div
            key={t.id}
            className="rail-item"
            aria-selected={selectedTurnId === t.id}
            onClick={() => selectTurn(t.id)}
          >
            <span className="mode-badge" data-mode={t.mode}>{t.mode}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '85%', verticalAlign: 'middle' }}>
              {t.userText}
            </span>
          </div>
        ))}
      </div>

      <div className="rail-section">
        <h3>已知事實</h3>
        {facts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有記下事實</div>}
        {facts.map(f => (
          <div
            key={f.id}
            className="rail-item"
            aria-selected={selectedFactId === f.id}
            onClick={() => selectFact(f.id)}
            title={f.text}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>[{f.kind}]</span>
            {f.text.slice(0, 40)}{f.text.length > 40 ? '…' : ''}
          </div>
        ))}
      </div>

      <div className="rail-section">
        <h3>技能</h3>
        {skills.map(s => (
          <div
            key={s.name}
            className="rail-item"
            aria-selected={selectedSkillName === s.name}
            onClick={() => selectSkill(s.name)}
            title={s.description.length > 120 ? s.description.slice(0, 120) + "…" : s.description}
          >
            {s.name}
          </div>
        ))}
      </div>
    </aside>
  );
}
