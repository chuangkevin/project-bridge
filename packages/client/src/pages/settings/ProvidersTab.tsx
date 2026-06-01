import { useState } from 'react';
import { useSetting } from '../../hooks/useSettings';
import { api } from '../../lib/api';

function Row({ keyName, label, help, secret, multiline }: { keyName: string; label: string; help?: string; secret?: boolean; multiline?: boolean }) {
  const { value, present, save, remove } = useSetting(keyName);
  const [draft, setDraft] = useState('');
  return (
    <div className="setting-row">
      <label>{label}</label>
      {present ? (
        <div className="setting-row__field" style={{ alignItems: 'center' }}>
          <span className="setting-row__masked">已設定：{secret ? value : (value ?? '')}</span>
          <button className="setting-row__btn setting-row__btn--danger" onClick={() => remove()}>清除</button>
        </div>
      ) : (
        <div className="setting-row__field">
          {multiline ? (
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={help} rows={3} />
          ) : (
            <input
              type={secret ? 'password' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={help}
            />
          )}
          <button className="setting-row__btn" onClick={async () => { await save(draft); setDraft(''); }}>儲存</button>
        </div>
      )}
      {help && !present && <div className="setting-row__help">{help}</div>}
    </div>
  );
}

export default function ProvidersTab() {
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const startOAuth = async () => {
    setOauthStatus('connecting');
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>('/api/openai-oauth/start', { method: 'POST', body: JSON.stringify({}) });
      const popup = window.open(authorizeUrl, '_blank', 'width=600,height=700');
      if (!popup) throw new Error('popup blocked');
      const handler = (ev: MessageEvent) => {
        if (ev.data?.source !== 'openai-oauth') return;
        window.removeEventListener('message', handler);
        if (ev.data.ok) setOauthStatus('connected');
        else setOauthStatus('error');
      };
      window.addEventListener('message', handler);
    } catch {
      setOauthStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>Gemini</h2>
      <Row keyName="gemini_api_keys" label="Gemini API keys (逗號分隔)" help="若有多把 key，以逗號分隔。" secret multiline />
      <Row keyName="gemini_model" label="Gemini Model" help="預設 gemini-2.5-flash" />

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>OpenCode</h2>
      <Row keyName="opencode_servers" label="OpenCode servers (JSON array)" help='例：["http://opencode-1:4096","http://opencode-2:4096"]' multiline />
      <Row keyName="opencode_server_password" label="OpenCode 共用密碼" help="若所有 server 都用 Basic Auth，填這裡。" secret />

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>OpenAI</h2>
      <Row keyName="openai_api_key" label="OpenAI API key (備援)" help="不用 OAuth 時可直接填 key。" secret />
      <div className="setting-row">
        <label>OpenAI OAuth 授權</label>
        <div className="setting-row__field">
          <button className="setting-row__btn" onClick={startOAuth} disabled={oauthStatus === 'connecting'}>
            {oauthStatus === 'connecting' ? '連線中…' : oauthStatus === 'connected' ? '已連線 — 重新連線' : '連線 OpenAI'}
          </button>
        </div>
        <div className="setting-row__help">點擊後跳出 OpenAI 授權視窗（PKCE flow）。</div>
      </div>

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>服務</h2>
      <Row keyName="public_base_url" label="Public Base URL" help="正式環境一定要設，影響 OAuth callback。例：https://designbridge.example.com" />
    </div>
  );
}
