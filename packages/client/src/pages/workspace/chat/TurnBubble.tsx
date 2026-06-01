import type { Turn } from '../../../hooks/useTurns';
import { useState } from 'react';

export default function TurnBubble({ turn }: { turn: Turn }) {
  const [showThinking, setShowThinking] = useState(false);
  return (
    <>
      <div className="bubble bubble--user">{turn.userText}</div>
      <div className="bubble bubble--ai">
        {turn.aiResponse.thinking && (
          <>
            <button
              onClick={() => setShowThinking(!showThinking)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, marginBottom: 4, padding: 0,
              }}
            >
              {showThinking ? '▼ 隱藏推理' : '▶ 顯示推理'}
            </button>
            {showThinking && (
              <div className="bubble__thinking">{turn.aiResponse.thinking}</div>
            )}
          </>
        )}
        <div>{turn.aiResponse.text}</div>
        {turn.skillsUsed && turn.skillsUsed.length > 0 && (
          <div className="bubble__skills">
            使用技能：{turn.skillsUsed.map((s) => <span key={s}>{s}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
