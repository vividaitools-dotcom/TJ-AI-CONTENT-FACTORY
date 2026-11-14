'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiJson } from './ui';

export type Project = {
  id: string;
  title: string;
  topic: string | null;
  niche: string | null;
  status: string;
  aspect: string;
  language: string;
  created_at: number;
  updated_at: number;
  scene_count?: number;
  video_count?: number;
};

type ProjectContextValue = {
  projects: Project[];
  active: Project | null;
  activeId: string | null;
  loading: boolean;
  refresh: () => Promise<Project[]>;
  select: (id: string | null) => void;
  create: (input: { title: string; topic?: string; aspect?: string }) => Promise<Project>;
  update: (id: string, patch: Partial<Project>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);
const STORAGE_KEY = 'tjcf.activeProject';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await apiJson<{ projects: Project[] }>('/api/projects');
    setProjects(data.projects);
    setLoading(false);
    return data.projects;
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    refresh()
      .then((list) => {
        const preferred = stored && list.some((project) => project.id === stored) ? stored : list[0]?.id || null;
        setActiveId(preferred);
      })
      .catch(() => setLoading(false));
  }, [refresh]);

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const create = useCallback(
    async (input: { title: string; topic?: string; aspect?: string }) => {
      const data = await apiJson<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
      select(data.project.id);
      return data.project;
    },
    [refresh, select],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Project>) => {
      await apiJson(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiJson(`/api/projects/${id}`, { method: 'DELETE' });
      const list = await refresh();
      if (activeId === id) select(list[0]?.id || null);
    },
    [refresh, select, activeId],
  );

  const value = useMemo<ProjectContextValue>(() => {
    const active = projects.find((project) => project.id === activeId) || null;
    return { projects, active, activeId, loading, refresh, select, create, update, remove };
  }, [projects, activeId, loading, refresh, select, create, update, remove]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProjects must be used inside ProjectProvider');
  return context;
}

/** Compact project switcher used at the top of every module. */
export function ProjectBar({ allowCreate = true }: { allowCreate?: boolean }) {
  const { projects, activeId, select, create, loading } = useProjects();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <div className="skeleton h-11 rounded-xl" />;

  async function submit() {
    if (title.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      await create({ title: title.trim() });
      setTitle('');
      setCreating(false);
    } catch (err: any) {
      setError(err.message || 'Could not create the project.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-tight flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-slate-500">Project</span>
        <select
          className="select flex-1 !min-h-9 !py-1.5 text-[0.82rem]"
          value={activeId || ''}
          onChange={(event) => select(event.target.value || null)}
        >
          {!projects.length ? <option value="">No projects yet</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        {allowCreate ? (
          <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : '+ New'}
          </button>
        ) : null}
      </div>
      {creating ? (
        <div className="flex items-center gap-2">
          <input
            className="input !min-h-9 !py-1.5 text-[0.85rem]"
            placeholder="New project title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
          />
          <button type="button" className="btn btn-sm btn-primary shrink-0" disabled={busy} onClick={submit}>
            Create
          </button>
        </div>
      ) : null}
      {error ? <p className="text-[0.72rem] text-rose-300">{error}</p> : null}
    </div>
  );
}
