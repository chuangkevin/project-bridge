export default function AboutTab() {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
      <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>DesignBridge M1</h3>
      <p>AI 設計顧問與多人協作平台</p>
      <p><strong>模式</strong>：顧問（諮詢）、架構（頁面流程）、設計（Vue + Tailwind）</p>
      <p><strong>合議</strong>：在顧問模式可開啟，由 PM／Designer／Engineer／Moderator 四個視角共同討論。</p>
      <p><strong>多人</strong>：同一專案網址可以多人同時打開，事件透過 Socket.io 即時同步。</p>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '24px 0' }} />
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        本機資料目錄 · SQLite + 檔案儲存 · 沒有外部資料庫依賴
      </p>
    </div>
  );
}
