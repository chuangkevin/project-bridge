import { useState, useEffect, useCallback } from 'react';

interface ElementConstraint {
  id: string;
  bridgeId: string;
  constraintType: string;
  min: number | null;
  max: number | null;
  pattern: string | null;
  required: boolean;
  errorMessage: string | null;
}

interface Props {
  projectId: string;
  bridgeId: string;
  onClose: () => void;
  onSaved?: () => void;
}

const CONSTRAINT_TYPES = ['text', 'number', 'date', 'email', 'phone', 'custom'];

export default function ConstraintPanel({ projectId, bridgeId, onClose, onSaved }: Props) {
  const [constraint, setConstraint] = useState<ElementConstraint | null>(null);
  const [constraintType, setConstraintType] = useState('text');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [pattern, setPattern] = useState('');
  const [required, setRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/element-constraints`);
        if (res.ok) {
          const constraints: ElementConstraint[] = await res.json();
          const existing = constraints.find(c => c.bridgeId === bridgeId);
          if (existing) {
            setConstraint(existing);
            setConstraintType(existing.constraintType || 'text');
            setMin(existing.min !== null ? String(existing.min) : '');
            setMax(existing.max !== null ? String(existing.max) : '');
            setPattern(existing.pattern || '');
            setRequired(existing.required);
            setErrorMessage(existing.errorMessage || '');
          }
        }
      } catch {
        // silently fail
      }
    })();
  }, [projectId, bridgeId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (constraint) {
        const res = await fetch(`/api/projects/${projectId}/element-constraints/${constraint.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            constraintType,
            min: min !== '' ? Number(min) : null,
            max: max !== '' ? Number(max) : null,
            pattern: pattern || null,
            required,
            errorMessage: errorMessage || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update constraint');
        const updated = await res.json();
        setConstraint(updated);
      } else {
        const res = await fetch(`/api/projects/${projectId}/element-constraints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bridgeId,
            constraintType,
            min: min !== '' ? Number(min) : null,
            max: max !== '' ? Number(max) : null,
            pattern: pattern || null,
            required,
            errorMessage: errorMessage || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to create constraint');
        const created = await res.json();
        setConstraint(created);
      }
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [constraint, projectId, bridgeId, constraintType, min, max, pattern, required, errorMessage, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!constraint) return;
    try {
      await fetch(`/api/projects/${projectId}/element-constraints/${constraint.id}`, { method: 'DELETE' });
      setConstraint(null);
      setConstraintType('text');
      setMin('');
      setMax('');
      setPattern('');
      setRequired(false);
      setErrorMessage('');
      onSaved?.();
    } catch {
      setError('Failed to delete constraint');
    }
  }, [constraint, projectId, onSaved]);

  return (
    <div style={styles.panel} data-testid="constraint-panel">
      <div style={styles.header}>
        <span style={styles.title}>Input Constraints</span>
        <button type="button" style={styles.closeBtn} onClick={onClose}>x</button>
      </div>

      <div style={styles.body}>
        <div style={styles.field}>
          <label style={styles.label}>Constraint Type</label>
          <select
            value={constraintType}
            onChange={e => setConstraintType(e.target.value)}
            style={styles.select}
            data-testid="constraint-type-select"
          >
            {CONSTRAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Min</label>
            <input
              type="number"
              value={min}
              onChange={e => setMin(e.target.value)}
              style={styles.input}
              placeholder="--"
              data-testid="constraint-min"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Max</label>
            <input
              type="number"
              value={max}
              onChange={e => setMax(e.target.value)}
              style={styles.input}
              placeholder="--"
              data-testid="constraint-max"
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Pattern (regex)</label>
          <input
            type="text"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            style={styles.input}
            placeholder="^[A-Z]{2}\d{4}$"
            data-testid="constraint-pattern"
          />
        </div>

        <div style={styles.checkboxField}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={required}
              onChange={e => setRequired(e.target.checked)}
              data-testid="constraint-required"
            />
            Required
          </label>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Error Message</label>
          <input
            type="text"
            value={errorMessage}
            onChange={e => setErrorMessage(e.target.value)}
            style={styles.input}
            placeholder="Custom validation error message"
            data-testid="constraint-error-msg"
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button type="button" style={styles.saveBtn} onClick={handleSave} disabled={saving} data-testid="save-constraint-btn">
            {saving ? 'Saving...' : (constraint ? 'Update' : 'Save')}
          </button>
          {constraint && (
            <button type="button" style={styles.deleteBtn} onClick={handleDelete} data-testid="delete-constraint-btn">
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    right: 380,
    top: 48,
    width: 280,
    background: '#ffffff',
    borderLeft: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    boxShadow: '-2px 4px 12px rgba(0,0,0,0.06)',
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '0 0 0 8px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontWeight: 600,
    fontSize: 13,
    color: '#1e293b',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '2px 6px',
  },
  body: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  input: {
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    fontSize: 13,
    background: '#f8fafc',
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  checkboxField: {
    display: 'flex',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  error: {
    color: '#ef4444',
    fontSize: 12,
    padding: '4px 8px',
    background: '#fef2f2',
    borderRadius: 4,
  },
  actions: {
    display: 'flex',
    gap: 8,
    paddingTop: 4,
  },
  saveBtn: {
    flex: 1,
    padding: '7px 14px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '7px 14px',
    background: '#fff',
    color: '#ef4444',
    border: '1px solid #fecaca',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
