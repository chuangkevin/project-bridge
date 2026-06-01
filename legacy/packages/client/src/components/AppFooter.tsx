import { APP_VERSION } from '../version';

export default function AppFooter() {
  return (
    <footer style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '4px 12px',
      fontSize: '11px',
      color: 'var(--text-muted)',
      textAlign: 'right',
      pointerEvents: 'none',
      zIndex: 1,
    }}>
      Project Bridge v{APP_VERSION}
    </footer>
  );
}
