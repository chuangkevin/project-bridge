import { useState, useEffect, useCallback } from 'react';

interface PageApiBinding {
  id: string;
  bridgeId: string;
  method: string;
  url: string;
  pageName: string | null;
  params: any[];
  responseSchema: any;
  fieldMappings: any[];
}

interface Props {
  projectId: string;
  activePage: string;
  pages: string[];
  onClose: () => void;
  onSaved?: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export default function PageApiBindingPanel({ projectId, activePage, pages, onClose, onSaved }: Props) {
  const [bindings, setBindings] = useState<PageApiBinding[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [pageName, setPageName] = useState(activePage || (pages.length > 0 ? pages[0] : 'default'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/api-bindings?page_level=true`);
      if (res.ok) {
        const data: PageApiBinding[] = await res.json();
        setBindings(data);
      }
    } catch {
      // silently fail
    }
  }, [projectId]);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  useEffect(() => {
    if (activePage) setPageName(activePage);
  }, [activePage]);

  const resetForm = () => {
    setMethod('GET');
    setUrl('');
    setDescription('');
    setPageName(activePage || (pages.length > 0 ? pages[0] : 'default'));
    setEditingId(null);
    setError(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (b: PageApiBinding) => {
    setEditingId(b.id);
    setMethod(b.method);
    setUrl(b.url);
    setPageName(b.pageName || 'default');
    // Description is stored in bridgeId for page-level (format: "page-api-{description}")
    const descMatch = b.bridgeId.match(/^page-api-(.+)$/);
    setDescription(descMatch ? descMatch[1] : b.bridgeId);
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!url.trim()) {
      setError('API URL is required');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const bridgeId = `page-api-${description.trim().replace(/\s+/g, '-').toLowerCase()}`;
      const body = {
        bridgeId,
        method,
        url: url.trim(),
        pageName: pageName || 'default',
        params: [],
        responseSchema: {},
        fieldMappings: [],
      };

      if (editingId) {
        const res = await fetch(`/api/projects/${projectId}/api-bindings/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to update binding');
      } else {
        const res = await fetch(`/api/projects/${projectId}/api-bindings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create binding');
      }

      setShowForm(false);
      resetForm();
      await fetchBindings();
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/projects/${projectId}/api-bindings/${id}`, { method: 'DELETE' });
      await fetchBindings();
      onSaved?.();
    } catch {
      setError('Failed to delete binding');
    }
  };

  const methodColor = (m: string): string => {
    switch (m) {
      case 'GET': return '#22c55e';
      case 'POST': return '#3b82f6';
      case 'PUT': return '#f59e0b';
      case 'DELETE': return '#ef4444';
      case 'PATCH': return '#a855f7';
      default: return '#64748b';
    }
  };

  return (
    <div style={styles.panel} data-testid="page-api-binding-panel">
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Page-level API</span>
          <span style={styles.subtitle}>Page-level API bindings not tied to elements</span>
        </div>
        <button type="button" style={styles.closeBtn} onClick={onClose}>x</button>
      </div>

      <div style={styles.body}>
        {/* Existing page-level bindings */}
        {bindings.length === 0 && !showForm && (
          <div style={styles.emptyState}>
            No page-level API bindings yet.
          </div>
        )}

        {bindings.map(b => (
          <div key={b.id} style={styles.bindingCard} data-testid="page-api-binding-card">
            <div style={styles.bindingCardHeader}>
              <span style={{ ...styles.methodBadge, backgroundColor: methodColor(b.method) }}>{b.method}</span>
              <code style={styles.urlText}>{b.url}</code>
            </div>
            <div style={styles.bindingCardMeta}>
              <span style={styles.pageTag}>{b.pageName || 'default'}</span>
              <span style={styles.bridgeIdLabel}>{b.bridgeId}</span>
            </div>
            <div style={styles.bindingCardActions}>
              <button type="button" style={styles.editBtn} onClick={() => handleEdit(b)}>Edit</button>
              <button type="button" style={styles.deleteBtnSmall} onClick={() => handleDelete(b.id)}>Delete</button>
            </div>
          </div>
        ))}

        {/* Add button */}
        {!showForm && (
          <button type="button" style={styles.addPageApiBtn} onClick={handleAdd} data-testid="add-page-api-btn">
            + New Page API
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div style={styles.formSection} data-testid="page-api-form">
            <div style={styles.formTitle}>{editingId ? 'Edit Page API' : 'New Page API'}</div>

            {/* Page name */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>Page</label>
              {pages.length > 0 ? (
                <select
                  value={pageName}
                  onChange={e => setPageName(e.target.value)}
                  style={styles.selectInput}
                  data-testid="page-api-page-select"
                  title="Select page"
                >
                  {pages.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={pageName}
                  onChange={e => setPageName(e.target.value)}
                  placeholder="Page name"
                  style={styles.textInput}
                  data-testid="page-api-page-input"
                />
              )}
            </div>

            {/* Description */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. fetch-user-list"
                style={styles.textInput}
                data-testid="page-api-description"
              />
            </div>

            {/* Method + URL */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>Endpoint</label>
              <div style={styles.row}>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  style={styles.methodSelect}
                  data-testid="page-api-method-select"
                  title="HTTP method"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="/api/endpoint"
                  style={styles.urlInput}
                  data-testid="page-api-url-input"
                />
              </div>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
                data-testid="page-api-save-btn"
              >
                {saving ? 'Saving...' : (editingId ? 'Update' : 'Save')}
              </button>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => { setShowForm(false); resetForm(); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
    borderBottom: '2px solid #8E6FA7',
    background: '#faf5ff',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    color: '#8E6FA7',
  },
  subtitle: {
    fontSize: 11,
    color: '#a78bba',
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
    gap: 10,
  },
  emptyState: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    padding: '24px 0',
  },
  bindingCard: {
    border: '1px solid #e9d5f5',
    borderRadius: 8,
    padding: '10px 12px',
    background: '#fdfaff',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  bindingCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  methodBadge: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  urlText: {
    fontSize: 12,
    color: '#1e293b',
    wordBreak: 'break-all' as const,
  },
  bindingCardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  pageTag: {
    fontSize: 10,
    background: '#f3e8ff',
    color: '#8E6FA7',
    padding: '1px 6px',
    borderRadius: 3,
    fontWeight: 600,
  },
  bridgeIdLabel: {
    fontSize: 10,
    color: '#a78bba',
  },
  bindingCardActions: {
    display: 'flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  editBtn: {
    background: 'none',
    border: '1px solid #d4bde8',
    color: '#8E6FA7',
    fontSize: 11,
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: 4,
    fontWeight: 500,
  },
  deleteBtnSmall: {
    background: 'none',
    border: '1px solid #fecaca',
    color: '#ef4444',
    fontSize: 11,
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: 4,
    fontWeight: 500,
  },
  addPageApiBtn: {
    padding: '10px 16px',
    background: '#8E6FA7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  formSection: {
    border: '1px solid #d4bde8',
    borderRadius: 8,
    padding: '12px',
    background: '#fdfaff',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  formTitle: {
    fontWeight: 600,
    fontSize: 13,
    color: '#8E6FA7',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  textInput: {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
  },
  selectInput: {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    background: '#f8fafc',
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
  error: {
    color: '#ef4444',
    fontSize: 12,
    padding: '4px 8px',
    background: '#fef2f2',
    borderRadius: 4,
  },
  formActions: {
    display: 'flex',
    gap: 8,
  },
  saveBtn: {
    flex: 1,
    padding: '8px 16px',
    background: '#8E6FA7',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '8px 16px',
    background: '#fff',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
