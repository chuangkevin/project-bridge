import { useState } from 'react';
import { useUsers, type AdminUser } from '../../hooks/useUsers';
import { useAuthStore } from '../../stores/useAuthStore';

export default function UsersTab() {
  const { state, create, disable, enable, remove, transferAdmin } = useUsers();
  const me = useAuthStore(s => s.user);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (state.kind === 'loading') {
    return <p className="settings-muted">載入中…</p>;
  }
  if (state.kind === 'forbidden') {
    return (
      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">使用者管理</h2>
        </header>
        <p className="settings-muted">{state.message}。目前登入：{me?.name ?? '未知'}</p>
      </section>
    );
  }
  if (state.kind === 'error') {
    return <p className="settings-error">{state.message}</p>;
  }

  const users = state.users;

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError('需要 name、email、password');
      return;
    }
    if (form.password.length < 8) {
      setFormError('密碼至少 8 字元');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await create({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      setForm({ name: '', email: '', password: '' });
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (u: AdminUser) => {
    if (!confirm(`確定將管理員權限轉移給「${u.name}」？轉移後你將失去管理權限。`)) return;
    setActionError(null);
    try { await transferAdmin(u.id); }
    catch (e) { setActionError((e as Error).message); }
  };

  const handleToggle = async (u: AdminUser) => {
    setActionError(null);
    try {
      if (u.is_active) await disable(u.id);
      else await enable(u.id);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`確定刪除使用者「${u.name}」？此操作無法復原。`)) return;
    setActionError(null);
    try { await remove(u.id); }
    catch (e) { setActionError((e as Error).message); }
  };

  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">使用者管理</h2>
          <span className="settings-section__badge">{users.length} 位</span>
        </header>

        <div className="settings-form" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 13, margin: 0, marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>新增使用者</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 'var(--space-2)' }}>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="名稱" disabled={busy} />
            <input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email" type="email" disabled={busy} />
            <input value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder="密碼（至少 8 字元）" type="password" disabled={busy} />
            <button className="settings-btn settings-btn--primary" onClick={handleCreate} disabled={busy}>
              {busy ? '新增中…' : '+ 新增'}
            </button>
          </div>
          {formError && <p className="settings-error" style={{ marginTop: 'var(--space-2)' }}>{formError}</p>}
        </div>

        {actionError && <p className="settings-error">{actionError}</p>}

        {users.length === 0 ? <p className="settings-muted">尚無使用者</p> : (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>Email</th>
                  <th>角色</th>
                  <th>狀態</th>
                  <th>建立時間</th>
                  <th className="settings-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.name}{isSelf && <span className="settings-muted" style={{ fontSize: 11, marginLeft: 4 }}>(你)</span>}</td>
                      <td className="settings-muted">{u.email}</td>
                      <td>
                        <span className={u.role === 'admin' ? 'settings-status settings-status--admin' : 'settings-status'}>
                          {u.role === 'admin' ? '管理員' : '使用者'}
                        </span>
                      </td>
                      <td>
                        <span className={u.is_active ? 'settings-status settings-status--active' : 'settings-status settings-status--disabled'}>
                          {u.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="settings-muted" style={{ fontSize: 12 }}>
                        {new Date(u.created_at).toLocaleDateString('zh-TW')}
                      </td>
                      <td className="settings-table__actions">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {u.role !== 'admin' && u.is_active === 1 && (
                            <button className="settings-btn" onClick={() => handleTransfer(u)}>轉移管理員</button>
                          )}
                          {!isSelf && (
                            <button className="settings-btn" onClick={() => handleToggle(u)}>
                              {u.is_active ? '停用' : '啟用'}
                            </button>
                          )}
                          {!isSelf && u.role !== 'admin' && (
                            <button className="settings-btn settings-btn--danger" onClick={() => handleDelete(u)}>刪除</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
