import type { ChatStreamState } from '../../../hooks/useChatStream';

const PHASE_LABEL: Record<string, string> = {
  loading_memory: '讀取專案記憶…',
  selecting_skills: '選擇技能…',
  thinking: '推理中…',
  answering: '回答中…',
  done: '完成',
  error: '失敗',
};

export default function PhaseIndicator({ state, userText }: { state: ChatStreamState; userText: string }) {
  const isStreaming = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  return (
    <>
      <div className="bubble bubble--user">{userText}</div>
      <div className="bubble bubble--ai">
        {isStreaming && (
          <div className="phase-indicator">
            <span className="phase-indicator__dot" />
            <span>{PHASE_LABEL[state.phase] ?? state.phase}</span>
            {state.selectedSkills.length > 0 && state.phase === 'selecting_skills' && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                ({state.selectedSkills.slice(0, 3).join(', ')}{state.selectedSkills.length > 3 ? '…' : ''})
              </span>
            )}
          </div>
        )}
        {state.thinkingText && (
          <div className="bubble__thinking">{state.thinkingText}</div>
        )}
        {state.answerText && <div>{state.answerText}</div>}
        {state.phase === 'error' && (
          <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 8 }}>錯誤：{state.error}</div>
        )}
      </div>
    </>
  );
}
