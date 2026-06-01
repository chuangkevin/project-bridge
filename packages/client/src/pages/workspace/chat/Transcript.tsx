import { useEffect, useRef } from 'react';
import TurnBubble from './TurnBubble';
import PhaseIndicator from './PhaseIndicator';
import type { Turn } from '../../../hooks/useTurns';
import type { ChatStreamState } from '../../../hooks/useChatStream';

interface Props {
  turns: Turn[];
  pending: { userText: string; state: ChatStreamState } | null;
}

export default function Transcript({ turns, pending }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending?.state.answerText.length, pending?.state.thinkingText.length, pending?.state.phase]);

  const isEmpty = turns.length === 0 && !pending;

  return (
    <div className="chat__transcript">
      {isEmpty && (
        <div className="chat__empty">
          <div style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 8 }}>顧問模式</div>
          <div>有什麼想討論的？輸入問題開始對話。<br />可以輸入 <code>/</code> 查看可用技能。</div>
        </div>
      )}
      {turns.map((t) => <TurnBubble key={t.id} turn={t} />)}
      {pending && <PhaseIndicator state={pending.state} userText={pending.userText} />}
      <div ref={endRef} />
    </div>
  );
}
