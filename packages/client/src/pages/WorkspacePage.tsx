import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import TopBar from './workspace/TopBar';
import LeftRail from './workspace/LeftRail';
import RightInspector from './workspace/RightInspector';
import ConsultStage from './workspace/ConsultStage';
import ArchitectStage from './workspace/ArchitectStage';
import DesignStage from './workspace/DesignStage';

interface Project { id: string; name: string; }

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { mode, setProject, mobileRailOpen } = useWorkspaceStore();
  const [project, setProject_] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setProject(id);
    api<Project>(`/api/projects/${id}`)
      .then(setProject_)
      .catch((e) => { if (e?.status === 404) setNotFound(true); });
  }, [id, setProject]);

  if (notFound) return <Navigate to="/projects" replace />;
  if (!project) return <div style={{ padding: 24 }}>載入專案中…</div>;

  return (
    <div className={`workspace${mobileRailOpen ? ' workspace--rail-open' : ''}`}>
      <TopBar projectName={project.name} />
      <LeftRail />
      <main className="workspace__center">
        {mode === 'consult' && <ConsultStage />}
        {mode === 'architect' && <ArchitectStage />}
        {mode === 'design' && <DesignStage />}
      </main>
      <RightInspector />
    </div>
  );
}
