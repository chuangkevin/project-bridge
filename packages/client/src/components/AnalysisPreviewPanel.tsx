import { useState } from 'react';

interface AnalysisPage {
  name: string;
  viewport: 'desktop' | 'mobile' | 'both';
  components: string[];
  interactions: string[];
  dataFields: string[];
  businessRules: string[];
  navigationTo: string[];
  layout?: string;
}

interface ExploreResult {
  domain: string;
  userPersonas: string[];
  coreUserFlow: string;
  painPoints: string[];
  edgeCases: string[];
  architectureDiagram: string;
  openQuestions: string[];
}

interface UxReviewIssue {
  severity: 'critical' | 'major' | 'minor';
  page: string;
  issue: string;
  suggestion: string;
}

interface UxReviewResult {
  overallScore: number;
  strengths: string[];
  issues: UxReviewIssue[];
  accessibilityNotes: string[];
  mobileConsiderations: string[];
}

interface DesignProposalResult {
  designDirection: string;
  layoutStrategy: string;
  componentPatterns: Array<{ pattern: string; usage: string }>;
  colorUsage: {
    primary: string;
    whenToUse: string;
    accentSuggestions: string[];
  };
  interactionDesign: Array<{ element: string; behavior: string }>;
}

interface AnalysisResult {
  documentType: string;
  pages: AnalysisPage[];
  globalRules: string[];
  summary: string;
  explore?: ExploreResult;
  uxReview?: UxReviewResult;
  designProposal?: DesignProposalResult;
}

interface Props {
  analysisResult: AnalysisResult;
  onClose: () => void;
}

const DOC_TYPE_ICONS: Record<string, string> = {
  spec: '\u{1F4CB}',      // clipboard
  design: '\u{1F3A8}',    // palette
  screenshot: '\u{1F4F7}', // camera
  mixed: '\u{1F4E6}',     // package
};

const DOC_TYPE_LABELS: Record<string, string> = {
  spec: '\u898F\u683C\u6587\u4EF6',
  design: '\u8A2D\u8A08\u7A3F',
  screenshot: '\u87A2\u5E55\u622A\u5716',
  mixed: '\u6DF7\u5408\u6587\u4EF6',
};

const VIEWPORT_LABELS: Record<string, string> = {
  desktop: '\u684C\u9762',
  mobile: '\u884C\u52D5',
  both: '\u684C\u9762+\u884C\u52D5',
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626' },
  major: { bg: '#fff7ed', text: '#ea580c' },
  minor: { bg: '#fefce8', text: '#ca8a04' },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '\u56B4\u91CD',
  major: '\u4E3B\u8981',
  minor: '\u6B21\u8981',
};

export default function AnalysisPreviewPanel({ analysisResult, onClose }: Props) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['pages']));

  const togglePage = (idx: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const r = analysisResult;
  const docIcon = DOC_TYPE_ICONS[r.documentType] || '\u{1F4C4}';
  const docLabel = DOC_TYPE_LABELS[r.documentType] || r.documentType;

  return (
    <div style={styles.overlay} data-testid="analysis-preview-panel">
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>{docIcon} {docLabel}</span>
          <button style={styles.closeBtn} onClick={onClose} title="\u95DC\u9589">&times;</button>
        </div>

        <div style={styles.body}>
          {/* Summary */}
          {r.summary && (
            <div style={styles.summaryCard}>
              <div style={styles.summaryText}>{r.summary}</div>
            </div>
          )}

          {/* Pages */}
          <div style={styles.section}>
            <button style={styles.sectionHeader} onClick={() => toggleSection('pages')}>
              <span style={styles.sectionTitle}>{expandedSections.has('pages') ? '\u25BC' : '\u25B6'} \u9801\u9762 ({r.pages.length})</span>
            </button>
            {expandedSections.has('pages') && (
              <div style={styles.sectionBody}>
                {r.pages.map((page, idx) => (
                  <div key={idx} style={styles.pageItem}>
                    <button style={styles.pageHeader} onClick={() => togglePage(idx)}>
                      <span style={styles.pageName}>
                        {expandedPages.has(idx) ? '\u25BC' : '\u25B6'} {page.name}
                      </span>
                      <span style={styles.viewportBadge}>{VIEWPORT_LABELS[page.viewport] || page.viewport}</span>
                      <span style={styles.countBadge}>{page.components.length} \u5143\u4EF6</span>
                    </button>
                    {expandedPages.has(idx) && (
                      <div style={styles.pageDetails}>
                        {page.components.length > 0 && (
                          <div style={styles.detailGroup}>
                            <div style={styles.detailLabel}>\u5143\u4EF6</div>
                            <div style={styles.tagList}>
                              {page.components.map((c, i) => (
                                <span key={i} style={styles.tag}>{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {page.interactions.length > 0 && (
                          <div style={styles.detailGroup}>
                            <div style={styles.detailLabel}>\u4E92\u52D5</div>
                            <ul style={styles.detailList}>
                              {page.interactions.map((item, i) => <li key={i} style={styles.detailListItem}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {page.businessRules.length > 0 && (
                          <div style={styles.detailGroup}>
                            <div style={styles.detailLabel}>\u696D\u52D9\u898F\u5247</div>
                            <ul style={styles.detailList}>
                              {page.businessRules.map((item, i) => <li key={i} style={styles.detailListItem}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {page.dataFields.length > 0 && (
                          <div style={styles.detailGroup}>
                            <div style={styles.detailLabel}>\u8CC7\u6599\u6B04\u4F4D</div>
                            <div style={styles.tagList}>
                              {page.dataFields.map((d, i) => (
                                <span key={i} style={{ ...styles.tag, backgroundColor: '#dbeafe', color: '#1e40af' }}>{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {page.layout && (
                          <div style={styles.detailGroup}>
                            <div style={styles.detailLabel}>\u4F48\u5C40</div>
                            <div style={styles.codeBlock}>{page.layout}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation Flow */}
          {r.pages.some(p => p.navigationTo.length > 0) && (
            <div style={styles.section}>
              <button style={styles.sectionHeader} onClick={() => toggleSection('nav')}>
                <span style={styles.sectionTitle}>{expandedSections.has('nav') ? '\u25BC' : '\u25B6'} \u5C0E\u822A\u6D41\u7A0B</span>
              </button>
              {expandedSections.has('nav') && (
                <div style={styles.sectionBody}>
                  <div style={styles.codeBlock}>
                    {r.pages
                      .filter(p => p.navigationTo.length > 0)
                      .map(p => `${p.name} \u2192 ${p.navigationTo.join(', ')}`)
                      .join('\n')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Global Rules */}
          {r.globalRules.length > 0 && (
            <div style={styles.section}>
              <button style={styles.sectionHeader} onClick={() => toggleSection('rules')}>
                <span style={styles.sectionTitle}>{expandedSections.has('rules') ? '\u25BC' : '\u25B6'} \u5168\u5C40\u898F\u5247 ({r.globalRules.length})</span>
              </button>
              {expandedSections.has('rules') && (
                <div style={styles.sectionBody}>
                  <ul style={styles.detailList}>
                    {r.globalRules.map((rule, i) => <li key={i} style={styles.detailListItem}>{rule}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Explore Insights */}
          {r.explore && (
            <div style={styles.section}>
              <button style={styles.sectionHeader} onClick={() => toggleSection('explore')}>
                <span style={styles.sectionTitle}>{expandedSections.has('explore') ? '\u25BC' : '\u25B6'} \u63A2\u7D22\u6D1E\u5BDF</span>
              </button>
              {expandedSections.has('explore') && (
                <div style={styles.sectionBody}>
                  <div style={styles.detailGroup}>
                    <div style={styles.detailLabel}>\u9818\u57DF</div>
                    <div style={styles.detailValue}>{r.explore.domain}</div>
                  </div>
                  {r.explore.userPersonas.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u4F7F\u7528\u8005\u89D2\u8272</div>
                      <div style={styles.tagList}>
                        {r.explore.userPersonas.map((p, i) => (
                          <span key={i} style={{ ...styles.tag, backgroundColor: '#ede9fe', color: '#6d28d9' }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={styles.detailGroup}>
                    <div style={styles.detailLabel}>\u6838\u5FC3\u6D41\u7A0B</div>
                    <div style={styles.detailValue}>{r.explore.coreUserFlow}</div>
                  </div>
                  {r.explore.painPoints.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u75DB\u9EDE</div>
                      <ul style={styles.detailList}>
                        {r.explore.painPoints.map((pp, i) => <li key={i} style={styles.detailListItem}>{pp}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.explore.edgeCases.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u908A\u7DE3\u60C5\u6CC1</div>
                      <ul style={styles.detailList}>
                        {r.explore.edgeCases.map((ec, i) => <li key={i} style={styles.detailListItem}>{ec}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.explore.openQuestions.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u958B\u653E\u554F\u984C</div>
                      <ul style={styles.detailList}>
                        {r.explore.openQuestions.map((q, i) => <li key={i} style={styles.detailListItem}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* UX Review */}
          {r.uxReview && (
            <div style={styles.section}>
              <button style={styles.sectionHeader} onClick={() => toggleSection('ux')}>
                <span style={styles.sectionTitle}>
                  {expandedSections.has('ux') ? '\u25BC' : '\u25B6'} UX \u5BE9\u67E5
                  <span style={styles.scoreBadge}>{r.uxReview.overallScore}/10</span>
                </span>
              </button>
              {expandedSections.has('ux') && (
                <div style={styles.sectionBody}>
                  {r.uxReview.strengths.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u512A\u9EDE</div>
                      <ul style={styles.detailList}>
                        {r.uxReview.strengths.map((s, i) => <li key={i} style={styles.detailListItem}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.uxReview.issues.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u554F\u984C ({r.uxReview.issues.length})</div>
                      {r.uxReview.issues.map((issue, i) => {
                        const sev = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.minor;
                        return (
                          <div key={i} style={{ ...styles.issueCard, backgroundColor: sev.bg }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ ...styles.severityBadge, color: sev.text, borderColor: sev.text }}>
                                {SEVERITY_LABELS[issue.severity] || issue.severity}
                              </span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>{issue.page}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#1e293b', marginBottom: 2 }}>{issue.issue}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>\u5EFA\u8B70\uFF1A{issue.suggestion}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.uxReview.accessibilityNotes.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u7121\u969C\u7919\u6CE8\u610F\u4E8B\u9805</div>
                      <ul style={styles.detailList}>
                        {r.uxReview.accessibilityNotes.map((n, i) => <li key={i} style={styles.detailListItem}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  {r.uxReview.mobileConsiderations.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u884C\u52D5\u88DD\u7F6E\u8003\u91CF</div>
                      <ul style={styles.detailList}>
                        {r.uxReview.mobileConsiderations.map((m, i) => <li key={i} style={styles.detailListItem}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Design Proposal */}
          {r.designProposal && (
            <div style={styles.section}>
              <button style={styles.sectionHeader} onClick={() => toggleSection('proposal')}>
                <span style={styles.sectionTitle}>{expandedSections.has('proposal') ? '\u25BC' : '\u25B6'} \u8A2D\u8A08\u65B9\u5411</span>
              </button>
              {expandedSections.has('proposal') && (
                <div style={styles.sectionBody}>
                  <div style={styles.detailGroup}>
                    <div style={styles.detailLabel}>\u8A2D\u8A08\u65B9\u5411</div>
                    <div style={styles.detailValue}>{r.designProposal.designDirection}</div>
                  </div>
                  <div style={styles.detailGroup}>
                    <div style={styles.detailLabel}>\u4F48\u5C40\u7B56\u7565</div>
                    <div style={styles.detailValue}>{r.designProposal.layoutStrategy}</div>
                  </div>
                  {r.designProposal.componentPatterns.length > 0 && (
                    <div style={styles.detailGroup}>
                      <div style={styles.detailLabel}>\u5143\u4EF6\u6A21\u5F0F</div>
                      {r.designProposal.componentPatterns.map((cp, i) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{cp.pattern}</span>
                          <span style={{ color: '#64748b' }}> — {cp.usage}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 9000,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
  },
  panel: {
    position: 'absolute',
    top: 48,
    right: 0,
    bottom: 0,
    width: '350px',
    backgroundColor: '#ffffff',
    borderLeft: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
    pointerEvents: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#94a3b8',
    lineHeight: 1,
    padding: '0 2px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 0,
  },
  summaryCard: {
    padding: '10px 14px',
    backgroundColor: '#f0f9ff',
    borderBottom: '1px solid #e2e8f0',
  },
  summaryText: {
    fontSize: '12px',
    color: '#1e293b',
    lineHeight: '1.5',
  },
  section: {
    borderBottom: '1px solid #f1f5f9',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  sectionBody: {
    padding: '0 14px 10px',
  },
  pageItem: {
    marginBottom: 4,
    borderRadius: 6,
    border: '1px solid #f1f5f9',
    overflow: 'hidden',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '6px 8px',
    background: '#f8fafc',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '12px',
  },
  pageName: {
    fontWeight: 600,
    color: '#1e293b',
    flex: 1,
    fontSize: '12px',
  },
  viewportBadge: {
    padding: '1px 6px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 500,
    flexShrink: 0,
  },
  countBadge: {
    padding: '1px 6px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    borderRadius: '8px',
    fontSize: '10px',
    flexShrink: 0,
  },
  pageDetails: {
    padding: '6px 8px 8px',
    backgroundColor: '#ffffff',
  },
  detailGroup: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: '12px',
    color: '#1e293b',
    lineHeight: '1.5',
  },
  detailList: {
    margin: 0,
    paddingLeft: 16,
    listStyle: 'disc',
  },
  detailListItem: {
    fontSize: '11px',
    color: '#475569',
    lineHeight: '1.6',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  tag: {
    padding: '2px 7px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    borderRadius: '4px',
    fontSize: '11px',
  },
  codeBlock: {
    padding: '8px 10px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
    whiteSpace: 'pre-wrap' as const,
    color: '#334155',
    lineHeight: '1.5',
  },
  scoreBadge: {
    padding: '1px 6px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    marginLeft: 6,
  },
  issueCard: {
    padding: '8px 10px',
    borderRadius: '6px',
    marginBottom: 6,
  },
  severityBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '4px',
    border: '1px solid',
  },
};
