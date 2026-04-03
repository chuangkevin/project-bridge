import { useEffect, useState, useRef } from 'react';
import { useCollaboration, CursorInfo } from '../contexts/CollaborationContext';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  containerRef: React.RefObject<HTMLElement>;
}

/** Overlay that renders remote collaborators' cursors on the preview area. */
export default function CursorLayer({ containerRef }: Props) {
  const { cursors, members } = useCollaboration();
  const { user } = useAuth();
  // Build a color lookup from members list (server cursor-move doesn't include color)
  const memberColors = new Map(members.map(m => [m.userId, m.color]));
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const fadeTimers = useRef<Map<string, number>>(new Map());
  const [fadedOut, setFadedOut] = useState<Set<string>>(new Set());

  // Track container position for coordinate mapping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerRect(el.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [containerRef]);

  // Manage fade-out timers: reset when cursor moves, fade after 5s
  useEffect(() => {
    cursors.forEach((_info, cursorUserId) => {
      // Clear existing timer
      const existing = fadeTimers.current.get(cursorUserId);
      if (existing) window.clearTimeout(existing);

      // Remove from faded-out set (cursor just moved)
      setFadedOut(prev => {
        if (!prev.has(cursorUserId)) return prev;
        const next = new Set(prev);
        next.delete(cursorUserId);
        return next;
      });

      // Set new fade timer
      const timer = window.setTimeout(() => {
        setFadedOut(prev => {
          const next = new Set(prev);
          next.add(cursorUserId);
          return next;
        });
      }, 5000);
      fadeTimers.current.set(cursorUserId, timer);
    });

    return () => {
      fadeTimers.current.forEach(t => window.clearTimeout(t));
    };
  }, [cursors]);

  if (!containerRect) return null;

  const entries: [string, CursorInfo][] = [];
  cursors.forEach((info, key) => {
    // Don't show own cursor
    if (user && info.userId === user.id) return;
    entries.push([key, info]);
  });

  if (entries.length === 0) return null;

  return (
    <div style={styles.overlay}>
      {entries.map(([key, info]) => {
        const isFaded = fadedOut.has(key);
        const color = memberColors.get(info.userId) || info.color || '#3b82f6';
        return (
          <div
            key={key}
            style={{
              ...styles.cursorContainer,
              left: `${info.x * 100}%`,
              top: `${info.y * 100}%`,
              opacity: isFaded ? 0 : 1,
            }}
          >
            {/* Arrow pointer */}
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none" style={styles.cursorArrow}>
              <path
                d="M0.5 0.5L15 10L8 11L5 19.5L0.5 0.5Z"
                fill={color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            {/* Name label */}
            <span
              style={{
                ...styles.nameLabel,
                backgroundColor: color,
              }}
            >
              {info.userName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 9999,
    overflow: 'hidden',
  },
  cursorContainer: {
    position: 'absolute',
    transition: 'left 150ms ease-out, top 150ms ease-out, opacity 300ms ease-out',
    pointerEvents: 'none',
  },
  cursorArrow: {
    display: 'block',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
  },
  nameLabel: {
    display: 'inline-block',
    marginLeft: 8,
    marginTop: -4,
    padding: '2px 8px',
    borderRadius: 9999,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
};
