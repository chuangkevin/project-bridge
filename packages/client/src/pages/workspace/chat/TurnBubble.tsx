import type { Turn } from '../../../hooks/useTurns';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Strip artifact tags, facts blocks, and code blocks from stored turn text.
 *  Retroactively cleans up turns that were stored before the server-side fix. */
function cleanDisplayText(text: string, mode?: string): string {
  let t = text
    .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
    .replace(/<facts>[\s\S]*?<\/facts>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
  if (mode === 'design') {
    t = t.replace(/```[\s\S]*?```/g, '').trim();
  }
  return t;
}

const PERSONA_LABEL: Record<string, string> = {
  pm: '📋 PM',
  designer: '🎨 Designer',
  engineer: '⚙️ Engineer',
  moderator: '🧑‍⚖️ Moderator',
};

export default function TurnBubble({ turn }: { turn: Turn }) {
  const [showThinking, setShowThinking] = useState(false);
  const isCouncil = (turn.skillsUsed ?? []).includes('council-moderator');

  return (
    <>
      <div className="bubble bubble--user">{turn.userText}</div>
      <div className="bubble bubble--ai">
        {turn.aiResponse.thinking && (
          <>
            <button
              onClick={() => setShowThinking(!showThinking)}
              aria-expanded={showThinking}
              aria-controls={`thinking-${turn.id}`}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, marginBottom: 4, padding: 0,
              }}
            >
              {showThinking ? '▼ 隱藏合議討論' : '▶ 顯示合議討論'}
            </button>
            {showThinking && isCouncil && (
              <div id={`thinking-${turn.id}`} className="bubble__thinking council-thinking">
                {turn.aiResponse.thinking.split('### ').filter(Boolean).map((block, i) => (
                  <div key={i} className="council__item">
                    <div className="council__label">{PERSONA_LABEL[block.split('\n')[0].toLowerCase()] ?? block.split('\n')[0]}</div>
                    <div className="council__text">{block.split('\n').slice(1).join('\n').trim()}</div>
                  </div>
                ))}
              </div>
            )}
            {showThinking && !isCouncil && (
              <div id={`thinking-${turn.id}`} className="bubble__thinking">{turn.aiResponse.thinking}</div>
            )}
          </>
        )}
        <div className="bubble__markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanDisplayText(turn.aiResponse.text, turn.mode)}</ReactMarkdown>
        </div>
        {turn.skillsUsed && turn.skillsUsed.length > 0 && (
          <div className="bubble__skills">
            使用技能：{turn.skillsUsed.map((s) => <span key={s}>{s}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
