import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Skill { name: string; description: string; }

interface Props {
  projectId: string;
  query: string;            // text after "/"
  onPick: (name: string) => void;
  onClose: () => void;
}

export default function SlashAutocomplete({ projectId, query, onPick, onClose }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`)
      .then(r => setSkills(r.skills))
      .catch(() => setSkills([]));
  }, [projectId]);

  const q = query.toLowerCase();
  const filtered = skills.filter(s => s.name.toLowerCase().includes(q));

  // Keyboard nav is wired by the Composer; activeIdx is exposed via ref
  // We need a ref-style controlled active index. Use a simple state + an effect that resets on query change.
  useEffect(() => { setActiveIdx(0); }, [query]);

  // onClose is available for future keyboard nav wiring
  void onClose;

  if (filtered.length === 0) {
    return (
      <div className="slash-popup">
        <div className="slash-popup__item" style={{ color: 'var(--text-muted)' }}>沒有匹配的技能</div>
      </div>
    );
  }

  return (
    <div className="slash-popup" role="listbox">
      {filtered.map((s, i) => (
        <div
          key={s.name}
          className="slash-popup__item"
          aria-selected={i === activeIdx}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => onPick(s.name)}
        >
          /{s.name}
          <small>{s.description}</small>
        </div>
      ))}
    </div>
  );
}
