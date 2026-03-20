import { useState, useEffect } from 'react';

export interface SpecData {
  fieldName: string;
  fieldType: string;
  constraintsMin: string;
  constraintsMax: string;
  constraintsPattern: string;
  apiMethod: string;
  apiPath: string;
  validationRules: string;
  businessLogic: string;
}

interface Props {
  specData: SpecData | null;
  onSave: (data: SpecData) => void;
  saving?: boolean;
}

const emptySpec: SpecData = {
  fieldName: '',
  fieldType: 'text',
  constraintsMin: '',
  constraintsMax: '',
  constraintsPattern: '',
  apiMethod: 'GET',
  apiPath: '',
  validationRules: '',
  businessLogic: '',
};

export default function SpecForm({ specData, onSave, saving }: Props) {
  const [form, setForm] = useState<SpecData>(specData || { ...emptySpec });

  useEffect(() => {
    setForm(specData || { ...emptySpec });
  }, [specData]);

  const update = (field: keyof SpecData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.field}>
        <label style={styles.label}>Field Name</label>
        <input
          style={styles.input}
          value={form.fieldName}
          onChange={e => update('fieldName', e.target.value)}
          placeholder="e.g. email"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Field Type</label>
        <select
          style={styles.select}
          value={form.fieldType}
          onChange={e => update('fieldType', e.target.value)}
        >
          <option value="text">text</option>
          <option value="number">number</option>
          <option value="email">email</option>
          <option value="password">password</option>
          <option value="select">select</option>
          <option value="checkbox">checkbox</option>
          <option value="date">date</option>
        </select>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>限制條件</label>
        <div style={styles.row}>
          <input
            style={styles.smallInput}
            value={form.constraintsMin}
            onChange={e => update('constraintsMin', e.target.value)}
            placeholder="Min"
          />
          <input
            style={styles.smallInput}
            value={form.constraintsMax}
            onChange={e => update('constraintsMax', e.target.value)}
            placeholder="Max"
          />
        </div>
        <input
          style={styles.input}
          value={form.constraintsPattern}
          onChange={e => update('constraintsPattern', e.target.value)}
          placeholder="Pattern (regex)"
        />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>API Endpoint</label>
        <div style={styles.row}>
          <select
            style={{ ...styles.select, width: '90px', flex: 'none' }}
            value={form.apiMethod}
            onChange={e => update('apiMethod', e.target.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            style={styles.input}
            value={form.apiPath}
            onChange={e => update('apiPath', e.target.value)}
            placeholder="/api/resource"
          />
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Validation Rules</label>
        <textarea
          style={styles.textarea}
          value={form.validationRules}
          onChange={e => update('validationRules', e.target.value)}
          placeholder="Enter validation rules..."
          rows={2}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Business Logic Notes</label>
        <textarea
          style={styles.textarea}
          value={form.businessLogic}
          onChange={e => update('businessLogic', e.target.value)}
          placeholder="Enter business logic notes..."
          rows={3}
        />
      </div>

      <button
        style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
        onClick={() => onSave(form)}
        disabled={saving}
      >
        {saving ? '儲存中...' : '儲存規格'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  smallInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  },
  row: {
    display: 'flex',
    gap: '8px',
  },
  textarea: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    boxSizing: 'border-box' as const,
  },
  saveBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
  },
};
