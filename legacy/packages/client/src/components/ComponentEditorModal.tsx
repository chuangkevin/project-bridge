import { useState, useEffect } from 'react';
import { ArchComponent } from '../stores/useArchStore';

interface Props {
  component: ArchComponent | null; // null = new
  pageNames: string[];
  onSave: (comp: ArchComponent) => void;
  onCancel: () => void;
}

const COMP_TYPES: { value: ArchComponent['type']; label: string; icon: string }[] = [
  { value: 'button', label: '按鈕', icon: '🔘' },
  { value: 'input', label: '輸入', icon: '✏️' },
  { value: 'select', label: '下拉', icon: '📋' },
  { value: 'radio', label: '單選', icon: '🔘' },
  { value: 'tab', label: '分頁', icon: '📑' },
  { value: 'card', label: '卡片', icon: '🃏' },
  { value: 'link', label: '連結', icon: '🔗' },
];

export default function ComponentEditorModal({ component, pageNames, onSave, onCancel }: Props) {
  const [name, setName] = useState(component?.name || '');
  const [type, setType] = useState<ArchComponent['type']>(component?.type || 'button');
  const [description, setDescription] = useState(component?.description || '');
  const [navigationTo, setNavigationTo] = useState(component?.navigationTo || '');
  const [constraintType, setConstraintType] = useState(component?.constraints?.type || '');
  const [constraintMin, setConstraintMin] = useState(component?.constraints?.min?.toString() || '');
  const [constraintMax, setConstraintMax] = useState(component?.constraints?.max?.toString() || '');
  const [constraintPattern, setConstraintPattern] = useState(component?.constraints?.pattern || '');
  const [constraintRequired, setConstraintRequired] = useState(component?.constraints?.required || false);
  const [states, setStates] = useState<Array<{ value: string; targetPage: string }>>(component?.states || []);

  const isNavType = ['button', 'card', 'link'].includes(type);
  const isInputType = type === 'input';
  const isStateType = ['select', 'radio', 'tab'].includes(type);

  useEffect(() => {
    // Reset fields when type changes
    if (!isNavType) setNavigationTo('');
    if (!isStateType) setStates([]);
  }, [type, isNavType, isStateType]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: component?.id || `comp-${Date.now()}`,
      name: name.trim(),
      type,
      description: description.trim(),
      constraints: isInputType ? {
        type: constraintType || null,
        min: constraintMin ? Number(constraintMin) : null,
        max: constraintMax ? Number(constraintMax) : null,
        pattern: constraintPattern || null,
        required: constraintRequired,
      } : {},
      states: isStateType ? states.filter(s => s.value.trim()) : [],
      navigationTo: isNavType && navigationTo ? navigationTo : null,
    });
  };

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>{component ? '編輯元件' : '新增元件'}</span>
          <button style={S.closeBtn} onClick={onCancel}>&times;</button>
        </div>

        <div style={S.body}>
          {/* Name */}
          <label style={S.label}>名稱</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="例：搜尋按鈕" autoFocus />

          {/* Type */}
          <label style={S.label}>類型</label>
          <select style={S.select} value={type} onChange={e => setType(e.target.value as ArchComponent['type'])}>
            {COMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>

          {/* Description */}
          <label style={S.label}>描述</label>
          <textarea style={S.textarea} value={description} onChange={e => setDescription(e.target.value)} placeholder="例：點擊後搜尋物件；坪數欄位，限正數" rows={2} />

          {/* Navigation (button/card/link) */}
          {isNavType && (
            <>
              <label style={S.label}>導航目標</label>
              <select style={S.select} value={navigationTo} onChange={e => setNavigationTo(e.target.value)}>
                <option value="">（無）</option>
                {pageNames.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </>
          )}

          {/* Constraints (input) */}
          {isInputType && (
            <>
              <label style={S.label}>限制條件</label>
              <div style={S.row}>
                <select style={{ ...S.select, flex: 1 }} value={constraintType} onChange={e => setConstraintType(e.target.value)}>
                  <option value="">（無）</option>
                  <option value="number">數字</option>
                  <option value="text">文字</option>
                  <option value="email">Email</option>
                  <option value="date">日期</option>
                  <option value="tel">電話</option>
                </select>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={constraintRequired} onChange={e => setConstraintRequired(e.target.checked)} /> 必填
                </label>
              </div>
              {constraintType === 'number' && (
                <div style={S.row}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="最小值" value={constraintMin} onChange={e => setConstraintMin(e.target.value)} />
                  <span style={{ color: '#94a3b8' }}>~</span>
                  <input style={{ ...S.input, flex: 1 }} placeholder="最大值" value={constraintMax} onChange={e => setConstraintMax(e.target.value)} />
                </div>
              )}
              {constraintType === 'text' && (
                <input style={S.input} placeholder="正則表達式 (optional)" value={constraintPattern} onChange={e => setConstraintPattern(e.target.value)} />
              )}
            </>
          )}

          {/* States (select/radio/tab) */}
          {isStateType && (
            <>
              <label style={S.label}>狀態列表（每個選項對應一個頁面）</label>
              {states.map((s, i) => (
                <div key={i} style={S.row}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="選項值" value={s.value} onChange={e => {
                    const updated = [...states];
                    updated[i] = { ...updated[i], value: e.target.value };
                    setStates(updated);
                  }} />
                  <select style={{ ...S.select, flex: 1 }} value={s.targetPage} onChange={e => {
                    const updated = [...states];
                    updated[i] = { ...updated[i], targetPage: e.target.value };
                    setStates(updated);
                  }}>
                    <option value="">（選擇頁面）</option>
                    {pageNames.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button style={S.removeBtn} onClick={() => setStates(states.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button style={S.addBtn} onClick={() => setStates([...states, { value: '', targetPage: '' }])}>+ 新增狀態</button>
            </>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onCancel}>取消</button>
          <button style={S.saveBtn} onClick={handleSave} disabled={!name.trim()}>儲存</button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 12, width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' },
  title: { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' },
  body: { padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid #e2e8f0' },
  label: { fontSize: 12, fontWeight: 600, color: '#475569' },
  input: { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' },
  select: { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff' },
  textarea: { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  row: { display: 'flex', gap: 6, alignItems: 'center' },
  addBtn: { padding: '4px 10px', border: '1px dashed #cbd5e1', borderRadius: 6, background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer' },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  cancelBtn: { padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' },
  saveBtn: { padding: '6px 14px', border: 'none', borderRadius: 6, background: '#8E6FA7', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
};
