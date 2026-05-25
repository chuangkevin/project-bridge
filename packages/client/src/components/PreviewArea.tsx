import React from 'react';
import PreviewPanel, { InteractionMode } from './PreviewPanel';
import { DeviceSize } from './DeviceSizeSelector';
import CodePanel from './CodePanel';
import CodeFileTree from './CodeFileTree';
import VisualEditor from './VisualEditor';

interface QuickStart {
  title: string;
  description: string;
  mode: 'design' | 'consultant' | 'architecture';
  prompt: string;
}

interface Props {
  html: string | null;
  viewMode: 'preview' | 'code';
  deviceSize: DeviceSize;
  isMobileViewport: boolean;
  isMultiPage: boolean;
  pages: string[];
  activePage: string;
  onNavigatePage: (page: string) => void;
  annotationMode: boolean;
  interactionMode: InteractionMode;
  onElementClick: (data: { bridgeId: string; tagName: string; textContent: string; rect: { x: number; y: number; width: number; height: number } }) => void;
  onElementDeselected: () => void;
  onIndicatorClick: (bridgeId: string) => void;
  annotationIndicators: { bridgeId: string; number: number }[];
  apiBindingIndicators: { bridgeId: string }[];
  /** ref to the outer div, used by VisualEditor to find the iframe */
  containerRef: React.RefObject<HTMLDivElement>;
  projectId: string;
  /** Called when a quick-start card is clicked in the empty state */
  onQuickStart: (mode: 'design' | 'consultant' | 'architecture', prompt: string) => void;
  quickStarts: QuickStart[];
  /** Callback to regenerate a page variant */
  onGenerateVariants: (page: string) => void;
  /** Callback to regenerate a specific page */
  onRegeneratePage: (page: string) => void;
}

const styles = {
  previewPane: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
  } as React.CSSProperties,
  pageSidebar: {
    width: '120px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
    padding: '8px 6px',
    gap: '4px',
  },
  pageSidebarMobile: {
    width: '100%',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'row' as const,
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    padding: '8px 6px',
    gap: '6px',
    alignItems: 'center',
  },
  pageSidebarLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    padding: '2px 6px 6px',
    flexShrink: 0,
  },
  pageSidebarItem: {
    display: 'block',
    width: '100%',
    padding: '6px 8px',
    border: '1px solid transparent',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left' as const,
    wordBreak: 'break-word' as const,
    flexShrink: 0,
  },
  pageSidebarItemActive: {
    backgroundColor: 'var(--accent-glass)',
    borderColor: 'var(--accent)',
    color: 'var(--text-accent)',
  },
  pageSidebarActionBtnMobile: {
    width: '30px',
    height: '30px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: 1,
  },
  previewScroll: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: 'var(--bg-hover)',
    boxSizing: 'border-box' as const,
  },
  previewScrollDesktop: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  deviceFrameDesktop: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  deviceFrameMobile: {
    width: '375px',
    height: '812px',
    flexShrink: 0,
    margin: '0 auto',
    border: '2px solid var(--border-secondary)',
    borderRadius: '40px',
    overflow: 'hidden',
  },
  deviceFrameTablet: {
    width: '768px',
    height: '1024px',
    flexShrink: 0,
    margin: '0 auto',
    border: '2px solid var(--border-secondary)',
    borderRadius: '40px',
    overflow: 'hidden',
  },
  emptyStateContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-primary)',
    padding: '40px 24px',
  },
  emptyStateCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-card)',
    border: '2px dashed var(--border-secondary)',
    borderRadius: '16px',
    padding: '48px 40px',
    maxWidth: '420px',
    width: '100%',
  },
  emptyStateIcon: {
    fontSize: '48px',
    lineHeight: 1,
    marginBottom: '16px',
  },
  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  emptyStateSubtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: '20px',
  },
  emptyStateHints: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    textAlign: 'left' as const,
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  emptyStateActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    width: '100%',
    marginTop: '18px',
  },
  emptyStateActionCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    alignItems: 'flex-start',
    textAlign: 'left' as const,
    padding: '14px',
    minHeight: '44px',
    borderRadius: '12px',
    border: '1px solid color-mix(in srgb, var(--accent, #8E6FA7) 30%, var(--border-primary))',
    backgroundColor: 'color-mix(in srgb, var(--accent, #8E6FA7) 10%, var(--bg-card))',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  emptyStateActionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  emptyStateActionDesc: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
};

export default function PreviewArea({
  html,
  viewMode,
  deviceSize,
  isMobileViewport,
  isMultiPage,
  pages,
  activePage,
  onNavigatePage,
  annotationMode,
  interactionMode,
  onElementClick,
  onElementDeselected,
  onIndicatorClick,
  annotationIndicators,
  apiBindingIndicators,
  containerRef,
  projectId,
  onQuickStart,
  quickStarts,
  onGenerateVariants,
  onRegeneratePage,
}: Props) {
  return (
    <div style={styles.previewPane} ref={containerRef} data-testid="preview-area">
      {viewMode === 'code' ? (
        !html ? (
          <div style={styles.emptyStateContainer}>
            <div style={{ ...styles.emptyStateCard, backgroundColor: 'var(--bg-elevated)', border: '2px dashed var(--border-primary)' }}>
              <div style={styles.emptyStateIcon}>💻</div>
              <div style={{ ...styles.emptyStateTitle, color: 'var(--text-secondary)' }}>尚未生成原型，請先在對話中描述需求</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobileViewport ? 'column' : 'row' }}>
            {isMobileViewport && isMultiPage && pages.length > 1 && (
              <div style={styles.pageSidebarMobile}>
                <div style={styles.pageSidebarLabel}>頁面</div>
                {pages.map(page => (
                  <div key={page} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      style={{ ...styles.pageSidebarItem, ...(activePage === page ? styles.pageSidebarItemActive : {}), width: 'auto', whiteSpace: 'nowrap' }}
                      onClick={() => onNavigatePage(page)}
                    >
                      {page}
                    </button>
                    <button
                      type="button"
                      onClick={() => onGenerateVariants(page)}
                      style={styles.pageSidebarActionBtnMobile}
                      title="其他方案"
                    >
                      🔄
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!isMobileViewport && (
              <CodeFileTree pages={pages} activePage={activePage || null} onSelect={onNavigatePage} html={html || ''} />
            )}
            <CodePanel html={html} pages={pages} activePage={activePage} onPageChange={onNavigatePage} />
          </div>
        )
      ) : (
        <>
          {isMultiPage && pages.length > 1 && (
            <div style={isMobileViewport ? styles.pageSidebarMobile : styles.pageSidebar}>
              <div style={styles.pageSidebarLabel}>頁面</div>
              {pages.map(page => (
                <div key={page} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    type="button"
                    style={{ ...styles.pageSidebarItem, ...(activePage === page ? styles.pageSidebarItemActive : {}), flex: 1 }}
                    onClick={() => onNavigatePage(page)}
                    data-testid={`page-tab-${page}`}
                  >
                    {page}
                  </button>
                  {isMobileViewport && (
                    <button
                      type="button"
                      onClick={() => onGenerateVariants(page)}
                      style={styles.pageSidebarActionBtnMobile}
                      title="其他方案"
                    >
                      🔄
                    </button>
                  )}
                  {!isMobileViewport && (
                    <>
                      <button
                        type="button"
                        onClick={() => onGenerateVariants(page)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5, padding: '2px' }}
                        title="其他方案"
                      >
                        🔄
                      </button>
                      <button
                        type="button"
                        onClick={() => onRegeneratePage(page)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5, padding: '2px' }}
                        title="重新生成此頁面"
                      >
                        ↻
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={deviceSize === 'desktop' && !isMobileViewport ? styles.previewScrollDesktop : styles.previewScroll}>
            {!html ? (
              <div style={styles.emptyStateContainer}>
                <div style={styles.emptyStateCard}>
                  <div style={styles.emptyStateIcon}>🎨</div>
                  <div style={styles.emptyStateTitle}>尚未生成原型</div>
                  <div style={styles.emptyStateSubtitle}>在左側聊天輸入你的需求，或上傳設計稿 PDF，AI 將生成互動式原型</div>
                  <ul style={styles.emptyStateHints}>
                    <li>💡 描述你想要的頁面設計</li>
                    <li>📎 上傳設計稿 PDF 讓 AI 分析樣式</li>
                    <li>⚡ 點擊元素可以直接修改</li>
                  </ul>
                  <div style={styles.emptyStateActionGrid}>
                    {quickStarts.map(item => (
                      <button key={item.title} type="button" style={styles.emptyStateActionCard} onClick={() => onQuickStart(item.mode, item.prompt)}>
                        <div style={styles.emptyStateActionTitle}>{item.title}</div>
                        <div style={styles.emptyStateActionDesc}>{item.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={deviceSize === 'mobile' ? styles.deviceFrameMobile : deviceSize === 'tablet' ? styles.deviceFrameTablet : styles.deviceFrameDesktop}>
                <PreviewPanel
                  html={html}
                  deviceSize={deviceSize}
                  annotationMode={annotationMode}
                  interactionMode={interactionMode}
                  onElementClick={onElementClick}
                  onElementDeselected={onElementDeselected}
                  onIndicatorClick={onIndicatorClick}
                  annotations={annotationIndicators}
                  apiBindings={apiBindingIndicators}
                />
                {interactionMode === 'visual-edit' && (
                  <VisualEditor
                    projectId={projectId}
                    iframeRef={{ current: containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null } as React.RefObject<HTMLIFrameElement>}
                    active={interactionMode === 'visual-edit'}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export type { QuickStart };
