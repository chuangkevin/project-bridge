import type { ChatStreamState } from '../../../hooks/useChatStream';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PHASE_LABEL: Record<string, string> = {
  loading_memory: '讀取專案記憶…',
  selecting_skills: '挑選知識中…',
  thinking: '推理中…',
  answering: '生成設計中…',
  council_start: '合議啟動…',
  council_pm: 'PM 分析中…',
  council_designer: 'Designer 分析中…',
  council_engineer: 'Engineer 分析中…',
  council_moderator: 'Moderator 彙整中…',
  done: '完成',
  error: '失敗',
};

const PERSONA_LABEL: Record<string, string> = {
  pm: '📋 PM',
  designer: '🎨 Designer',
  engineer: '⚙️ Engineer',
  moderator: '🧑‍⚖️ Moderator',
};

export default function PhaseIndicator({ state, userText }: { state: ChatStreamState; userText: string }) {
  const isStreaming = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  return (
    <>
      <div className="bubble bubble--user">{userText}</div>
      <div className="bubble bubble--ai">
        {isStreaming && (
          <div className="phase-indicator" role="status" aria-live="polite">
            <span className="phase-indicator__dot" aria-hidden="true" />
            <span>
              {state.phase.startsWith('council')
                // Council: show "合議討論中 (X/3 完成)" — avoid confusing "PM 分析中" when PM is done
                ? `合議討論中（${state.council.length}/3 完成）`
                : (PHASE_LABEL[state.phase] ?? state.phase)
              }
            </span>
            {state.selectedSkills.length > 0 && state.phase === 'selecting_skills' && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                ({state.selectedSkills.slice(0, 3).join(', ')}{state.selectedSkills.length > 3 ? '…' : ''})
              </span>
            )}
          </div>
        )}
        {state.council.length > 0 && (
          <div className="council">
            {state.council.map((c) => (
              <div
                key={c.persona}
                className={`council__item${state.activeCouncilPersona === c.persona ? ' council__item--active' : ''}`}
                role="region"
                aria-label={`${PERSONA_LABEL[c.persona] ?? c.persona} 的意見`}
              >
                <div className="council__label">{PERSONA_LABEL[c.persona] ?? c.persona}</div>
                <div className="council__text">
                  {c.text
                    .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
                    .replace(/```[\s\S]*?```/g, '')
                    .trim()}
                </div>
              </div>
            ))}
          </div>
        )}
        {state.thinkingText && (
          <div className="bubble__thinking">{state.thinkingText}</div>
        )}
        {state.answerText && (
          <div className="bubble__markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {state.answerText
                .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
                .replace(/<facts>[\s\S]*?<\/facts>/gi, '')
                .trim()}
            </ReactMarkdown>
          </div>
        )}
        {state.phase === 'error' && (
          <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 8 }}>錯誤：{state.error}</div>
        )}
      </div>
    </>
  );
}
