import { useEffect, useRef } from 'react';
import TurnBubble from './TurnBubble';
import PhaseIndicator from './PhaseIndicator';
import type { Turn } from '../../../hooks/useTurns';
import type { ChatStreamState } from '../../../hooks/useChatStream';

interface Props {
  turns: Turn[];
  pending: { userText: string; state: ChatStreamState } | null;
  /** 點選 quick-reply chip 時直接送出該回答（不用手打） */
  onQuickReply?: (text: string) => void;
  quickReplyDisabled?: boolean;
}

export default function Transcript({ turns, pending, onQuickReply, quickReplyDisabled }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending?.state.answerText.length, pending?.state.thinkingText.length, pending?.state.phase]);

  const isEmpty = turns.length === 0 && !pending;

  return (
    <div className="chat__transcript">
      {isEmpty && (
        <div className="chat__empty">
          <div style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 8 }}>開始對話</div>
          <div>描述需求或貼上參考網址/截圖，AI 會直接給出可互動的 wireframe。<br />可以輸入 <code>/</code> 查看可用技能。</div>
        </div>
      )}
      {turns.map((t) => <TurnBubble key={t.id} turn={t} />)}
      {pending && <PhaseIndicator state={pending.state} userText={pending.userText} />}
      {(() => {
        // Quick-reply chips：取最新的選項（串流中的優先，否則最後一則 AI 回覆）
        const liveChoices = pending?.state.choices ?? [];
        const lastTurn = turns[turns.length - 1];
        const turnChoices = !pending && lastTurn?.aiResponse.choices ? lastTurn.aiResponse.choices : [];
        const choices = liveChoices.length > 0 ? liveChoices : turnChoices;
        if (!onQuickReply || choices.length === 0) return null;
        return (
          <div className="chat__choices" role="group" aria-label="快速回覆選項">
            {choices.map((c) => (
              <button
                key={c}
                className="chat__choice-chip"
                disabled={quickReplyDisabled}
                onClick={() => onQuickReply(c)}
              >{c}</button>
            ))}
          </div>
        );
      })()}
      <div ref={endRef} />
    </div>
  );
}
