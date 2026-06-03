import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { getSocket } from '../lib/socket';
import TopBar from './workspace/TopBar';
import LeftRail from './workspace/LeftRail';
import RightInspector from './workspace/RightInspector';
import ConsultStage from './workspace/ConsultStage';
import ArchitectStage from './workspace/ArchitectStage';
import DesignStage from './workspace/DesignStage';

interface Project { id: string; name: string; }

interface CursorState { x: number; y: number; color: string; }

// Throttle cursor emit to max 30 fps (≈33 ms between events)
const CURSOR_THROTTLE_MS = 33;

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { mode, setProject, mobileRailOpen } = useWorkspaceStore();
  const [project, setProject_] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const lastEmitRef = useRef<number>(0);

  useEffect(() => {
    if (!id) return;
    setProject(id);
    api<Project>(`/api/projects/${id}`)
      .then(setProject_)
      .catch((e) => { if (e?.status === 404) setNotFound(true); });
  }, [id, setProject]);

  // Cursor presence: subscribe to other users' cursors
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();

    const handleCursorMove = (data: { socketId: string; x: number; y: number; color: string }) => {
      setCursors(prev => ({ ...prev, [data.socketId]: { x: data.x, y: data.y, color: data.color } }));
    };
    const handleCursorLeave = (data: { socketId: string }) => {
      setCursors(prev => {
        const next = { ...prev };
        delete next[data.socketId];
        return next;
      });
    };

    socket.on('cursor:move', handleCursorMove);
    socket.on('cursor:leave', handleCursorLeave);

    return () => {
      socket.off('cursor:move', handleCursorMove);
      socket.off('cursor:leave', handleCursorLeave);
      socket.emit('cursor:leave', id);
    };
  }, [id]);

  // Broadcast own cursor position (throttled to ~30 fps)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!id) return;
    const now = Date.now();
    if (now - lastEmitRef.current < CURSOR_THROTTLE_MS) return;
    lastEmitRef.current = now;
    const socket = getSocket();
    socket.emit('cursor:move', { projectId: id, x: e.clientX, y: e.clientY, color: '#c084fc' });
  }, [id]);

  if (notFound) return <Navigate to="/projects" replace />;
  if (!project) return <div style={{ padding: 24 }}>載入專案中…</div>;

  return (
    <div
      className={`workspace${mobileRailOpen ? ' workspace--rail-open' : ''}${mode !== 'consult' ? ' workspace--no-right' : ''}`}
      onMouseMove={handleMouseMove}
    >
      <TopBar projectName={project.name} />
      <LeftRail />
      <main className="workspace__center">
        {mode === 'consult' && <ConsultStage />}
        {mode === 'architect' && <ArchitectStage />}
        {mode === 'design' && <DesignStage />}
      </main>
      {/* RightInspector only for consult mode — design/architect have their own right panels */}
      {mode === 'consult' && <RightInspector />}

      {/* Remote cursor dots */}
      {Object.entries(cursors).map(([socketId, { x, y, color }]) => (
        <div
          key={socketId}
          style={{
            position: 'fixed',
            left: x,
            top: y,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            pointerEvents: 'none',
            zIndex: 9999,
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.05s, top 0.05s',
          }}
        />
      ))}
    </div>
  );
}
