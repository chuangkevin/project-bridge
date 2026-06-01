import { useState, useEffect, useCallback } from 'react';

interface Param {
  name: string;
  type: string;
  required: boolean;
}

interface FieldMapping {
  responseField: string;
  targetBridgeId: string;
}

interface Dependency {
  id?: string;
  targetBridgeId: string;
  trigger: string;
  action: string;
}

interface IncomingDependency {
  id: string;
  sourceBridgeId: string;
  trigger: string;
  action: string;
}

interface ApiBinding {
  id: string;
  bridgeId: string;
  method: string;
  url: string;
  params: Param[];
  responseSchema: any;
  fieldMappings: FieldMapping[];
}

interface Props {
  projectId: string;
  bridgeId: string;
  tagName: string;
  onClose: () => void;
  onSaved?: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const TRIGGERS = ['onChange', 'onClick', 'onSubmit', 'onFocus', 'onBlur', 'custom'];
const PARAM_TYPES = ['string', 'number', 'boolean', 'array', 'object'];

export default function ApiBindingPanel({ projectId, bridgeId, tagName, onClose, onSaved }: Props) {
  const [binding, setBinding] = useState<ApiBinding | null>(null);
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [params, setParams] = useState<Param[]>([]);
  const [responseSchema, setResponseSchema] = useState('{}');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [outgoingDeps, setOutgoingDeps] = useState<Dependency[]>([]);
  const [incomingDeps, setIncomingDeps] = useState<IncomingDependency[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing binding and dependencies
  useEffect(() => {
    (async () => {
      try {
        const [bindingsRes, depsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/api-bindings`),
          fetch(`/api/projects/${projectId}/component-dependencies`),
        ]);
        if (bindingsRes.ok) {
          const bindings: ApiBinding[] = await bindingsRes.json();
          const existing = bindings.find(b => b.bridgeId === bridgeId);
          if (existing) {
            setBinding(existing);
            setMethod(existing.method);
            setUrl(existing.url);
            setParams(existing.params || []);
            setResponseSchema(JSON.stringify(existing.responseSchema, null, 2));
            setFieldMappings(existing.fieldMappings || []);
          }
        }
        if (depsRes.ok) {
          const deps = await depsRes.json();
          setOutgoingDeps(
            deps.filter((d: any) => d.sourceBridgeId === bridgeId).map((d: any) => ({
              id: d.id,
              targetBridgeId: d.targetBridgeId,
              trigger: d.trigger,
              action: d.action,
            }))
          );
          setIncomingDeps(
            deps.filter((d: any) => d.targetBridgeId === bridgeId).map((d: any) => ({
              id: d.id,
              sourceBridgeId: d.sourceBridgeId,
              trigger: d.trigger,
              action: d.action,
            }))
          );
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
      // Validate JSON
      let parsedSchema: any;
      try {
        parsedSchema = JSON.parse(responseSchema);
      } catch {
        setError('Response schema must be valid JSON');
        setSaving(false);
        return;
      }

      // Save binding
      if (binding) {
        const res = await fetch(`/api/projects/${projectId}/api-bindings/${binding.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, url, params, responseSchema: parsedSchema, fieldMappings }),
        });
        if (!res.ok) throw new Error('Failed to update binding');
      } else {
        const res = await fetch(`/api/projects/${projectId}/api-bindings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bridgeId, method, url, params, responseSchema: parsedSchema, fieldMappings }),
        });
        if (!res.ok) throw new Error('Failed to create binding');
        const created = await res.json();
        setBinding(created);
      }

      // Save outgoing dependencies
      for (const dep of outgoingDeps) {
        if (dep.id) {
          await fetch(`/api/projects/${projectId}/component-dependencies/${dep.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceBridgeId: bridgeId, targetBridgeId: dep.targetBridgeId, trigger: dep.trigger, action: dep.action }),
          });
        } else {
          const res = await fetch(`/api/projects/${projectId}/component-dependencies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceBridgeId: bridgeId, targetBridgeId: dep.targetBridgeId, trigger: dep.trigger, action: dep.action }),
          });
          if (res.ok) {
            const created = await res.json();
            dep.id = created.id;
          }
        }
      }

      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [binding, projectId, bridgeId, method, url, params, responseSchema, fieldMappings, outgoingDeps, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!binding) return;
    try {
      await fetch(`/api/projects/${projectId}/api-bindings/${binding.id}`, { method: 'DELETE' });
      setBinding(null);
      setMethod('GET');
      setUrl('');
      setParams([]);
      setResponseSchema('{}');
      setFieldMappings([]);
      onSaved?.();
    } catch {
      setError('Failed to delete binding');
    }
  }, [binding, projectId, onSaved]);

  const addParam = () => setParams([...params, { name: '', type: 'string', required: false }]);
  const removeParam = (i: number) => setParams(params.filter((_, idx) => idx !== i));
  const updateParam = (i: number, field: keyof Param, value: any) => {
    const updated = [...params];
    (updated[i] as any)[field] = value;
    setParams(updated);
  };

  const addFieldMapping = () => setFieldMappings([...fieldMappings, { responseField: '', targetBridgeId: '' }]);
  const removeFieldMapping = (i: number) => setFieldMappings(fieldMappings.filter((_, idx) => idx !== i));
  const updateFieldMapping = (i: number, field: keyof FieldMapping, value: string) => {
    const updated = [...fieldMappings];
    updated[i][field] = value;
    setFieldMappings(updated);
  };

  const addDep = () => setOutgoingDeps([...outgoingDeps, { targetBridgeId: '', trigger: 'onChange', action: '' }]);
  const removeDep = (i: number) => {
    const dep = outgoingDeps[i];
    if (dep.id) {
      fetch(`/api/projects/${projectId}/component-dependencies/${dep.id}`, { method: 'DELETE' }).catch(() => {});
    }
    setOutgoingDeps(outgoingDeps.filter((_, idx) => idx !== i));
  };
  const updateDep = (i: number, field: keyof Dependency, value: string) => {
    const updated = [...outgoingDeps];
    (updated[i] as any)[field] = value;
    setOutgoingDeps(updated);
  };

  return (
    <div style={styles.panel} data-testid="api-binding-panel">
      <div style={styles.header}>
        <div>
          <span style={styles.title}>API Binding</span>
          <code style={styles.bridgeIdTag}>{bridgeId}</code>
          <span style={styles.tagLabel}>&lt;{tagName.toLowerCase()}&gt;</span>
        </div>
        <button type="button" style={styles.closeBtn} onClick={onClose}>x</button>
      </div>

      <div style={styles.body}>
        {/* Method + URL */}
        <div style={styles.row}>
          <select value={method} onChange={e => setMethod(e.target.value)} style={styles.methodSelect} data-testid="method-select">
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="/api/endpoint"
            style={styles.urlInput}
            data-testid="url-input"
          />
        </div>

        {/* Request Parameters */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Request Parameters</span>
            <button type="button" style={styles.addBtn} onClick={addParam}>+ Add</button>
          </div>
          {params.map((p, i) => (
            <div key={i} style={styles.paramRow}>
              <input
                type="text"
                value={p.name}
                onChange={e => updateParam(i, 'name', e.target.value)}
                placeholder="name"
                style={styles.paramInput}
              />
              <select value={p.type} onChange={e => updateParam(i, 'type', e.target.value)} style={styles.paramTypeSelect}>
                {PARAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={e => updateParam(i, 'required', e.target.checked)}
                />
                req
              </label>
              <button type="button" style={styles.removeBtn} onClick={() => removeParam(i)}>x</button>
            </div>
          ))}
        </div>

        {/* Response Schema */}
        <div style={styles.section}>
          <span style={styles.sectionTitle}>Response Schema (JSON)</span>
          <textarea
            value={responseSchema}
            onChange={e => setResponseSchema(e.target.value)}
            style={styles.textarea}
            rows={4}
            data-testid="response-schema"
          />
        </div>

        {/* Field Mappings */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Field Mappings</span>
            <button type="button" style={styles.addBtn} onClick={addFieldMapping}>+ Add</button>
          </div>
          {fieldMappings.map((fm, i) => (
            <div key={i} style={styles.paramRow}>
              <input
                type="text"
                value={fm.responseField}
                onChange={e => updateFieldMapping(i, 'responseField', e.target.value)}
                placeholder="response.field.path"
                style={styles.paramInput}
              />
              <input
                type="text"
                value={fm.targetBridgeId}
                onChange={e => updateFieldMapping(i, 'targetBridgeId', e.target.value)}
                placeholder="target-bridge-id"
                style={styles.paramInput}
              />
              <button type="button" style={styles.removeBtn} onClick={() => removeFieldMapping(i)}>x</button>
            </div>
          ))}
        </div>

        {/* Outgoing Dependencies */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Outgoing Dependencies</span>
            <button type="button" style={styles.addBtn} onClick={addDep}>+ Add</button>
          </div>
          {outgoingDeps.map((dep, i) => (
            <div key={i} style={styles.paramRow}>
              <input
                type="text"
                value={dep.targetBridgeId}
                onChange={e => updateDep(i, 'targetBridgeId', e.target.value)}
                placeholder="target-bridge-id"
                style={styles.paramInput}
              />
              <select value={dep.trigger} onChange={e => updateDep(i, 'trigger', e.target.value)} style={styles.paramTypeSelect}>
                {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                value={dep.action}
                onChange={e => updateDep(i, 'action', e.target.value)}
                placeholder="action description"
                style={{ ...styles.paramInput, flex: 2 }}
              />
              <button type="button" style={styles.removeBtn} onClick={() => removeDep(i)}>x</button>
            </div>
          ))}
        </div>

        {/* Incoming Dependencies (read-only) */}
        {incomingDeps.length > 0 && (
          <div style={styles.section}>
            <span style={styles.sectionTitle}>Depends On (incoming)</span>
            {incomingDeps.map((dep, i) => (
              <div key={i} style={styles.readOnlyRow}>
                <code>{dep.sourceBridgeId}</code>
                <span style={styles.depTrigger}>{dep.trigger}</span>
                <span>{dep.action}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button type="button" style={styles.saveBtn} onClick={handleSave} disabled={saving} data-testid="save-binding-btn">
            {saving ? 'Saving...' : (binding ? 'Update Binding' : 'Save Binding')}
          </button>
          {binding && (
            <button type="button" style={styles.deleteBtn} onClick={handleDelete} data-testid="delete-binding-btn">
              Remove Binding
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
    right: 0,
    top: 48,
    bottom: 0,
    width: 380,
    background: '#ffffff',
    borderLeft: '1px solid #e2e8f0',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#1e293b',
    marginRight: 8,
  },
  bridgeIdTag: {
    fontSize: 11,
    background: '#eff6ff',
    color: '#2563eb',
    padding: '2px 6px',
    borderRadius: 4,
    marginRight: 6,
  },
  tagLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '4px 8px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  methodSelect: {
    width: 90,
    padding: '6px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    background: '#f8fafc',
  },
  urlInput: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  addBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  },
  paramRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  paramInput: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    fontSize: 12,
  },
  paramTypeSelect: {
    width: 80,
    padding: '4px 6px',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    fontSize: 12,
  },
  checkboxLabel: {
    fontSize: 11,
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    whiteSpace: 'nowrap' as const,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 4px',
  },
  textarea: {
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
  },
  readOnlyRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 12,
    color: '#64748b',
    padding: '4px 8px',
    background: '#f8fafc',
    borderRadius: 4,
  },
  depTrigger: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 500,
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
    paddingTop: 8,
  },
  saveBtn: {
    flex: 1,
    padding: '8px 16px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 16px',
    background: '#fff',
    color: '#ef4444',
    border: '1px solid #fecaca',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
