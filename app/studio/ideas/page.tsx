'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiJson } from '@/components/ui';

type Idea = {
  id: string;
  title: string;
  hook: string | null;
  angle: string | null;
  format: string | null;
  score: number | null;
  notes: string | null;
};

const PLATFORMS = ['YouTube Shorts', 'YouTube long-form', 'TikTok', 'Instagram Reels', 'LinkedIn'];

export default function IdeasPage() {
  const { activeId } = useProjects();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [platform, setPlatform] = useState('YouTube Shorts');
  const [count, setCount] = useState(8);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('topic');
    if (preset) setTopic(preset);
  }, []);

  const load = useCallback(async () => {
    if (!activeId) {
      setSavedIdeas([]);
      return;
    }
    try {
      const data = await apiJson<{ ideas: Idea[] }>(`/api/ideas?projectId=${encodeURIComponent(activeId)}`);
      setSavedIdeas(data.ideas);
    } catch {
      setSavedIdeas([]);
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    if (topic.trim().length < 2) return setError('Enter the topic these ideas should come from.');
    setBusy(true);
    setError('');
    try {
      const data = await apiJson<{ ideas: Idea[] }>('/api/ideas', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), audience, platform, count, projectId: activeId }),
      });
      setIdeas(data.ideas);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not generate ideas.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 02</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">AI Idea Generator</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Scored concepts with hooks and angles. Needs one AI key — OpenRouter and Gemini both have free tiers.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topic or trend">
            <input className="input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. local AI on phones" />
          </Field>
          <Field label="Audience">
            <input className="input" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="e.g. indie founders" />
          </Field>
          <Field label="Platform">
            <select className="select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORMS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`How many ideas · ${count}`}>
            <input
              type="range"
              min={3}
              max={12}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-3 w-full accent-violet-500"
            />
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={generate} disabled={busy}>
            {busy ? 'Thinking…' : 'Generate ideas'}
          </button>
          {busy ? <Spinner /> : null}
        </div>

        {error ? (
          <div className="mt-3">
            <Notice kind="error" onClose={() => setError('')}>
              {error}
            </Notice>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Results" title="Idea board" hint="Higher score means stronger hook and clearer payoff." />
        {ideas.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {ideas.map((idea) => (
              <div key={idea.id} className="panel-tight p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[0.86rem] font-semibold leading-snug text-slate-100">{idea.title}</p>
                  <span className="chip shrink-0 text-emerald-200">{Math.round(Number(idea.score) || 0)}</span>
                </div>
                {idea.hook ? <p className="mt-1.5 text-[0.76rem] leading-relaxed text-violet-200/80">“{idea.hook}”</p> : null}
                {idea.angle ? <p className="mt-1 text-[0.74rem] leading-relaxed text-slate-400">{idea.angle}</p> : null}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="chip">{idea.format || platform}</span>
                  <Link
                    href={`/studio/scripts?idea=${encodeURIComponent(idea.title)}&topic=${encodeURIComponent(topic)}`}
                    className="btn btn-sm btn-ghost ml-auto"
                  >
                    Write script →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No ideas generated yet"
            hint="Generate a batch and each concept is saved to the selected project automatically."
          />
        )}
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Saved" title="Project idea bank" />
        {savedIdeas.length ? (
          <ul className="divide-y divide-white/5">
            {savedIdeas.map((idea) => (
              <li key={idea.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-[0.8rem] text-slate-200">{idea.title}</p>
                  <p className="text-[0.68rem] text-slate-500">{idea.hook || idea.angle || idea.format}</p>
                </div>
                <Link
                  href={`/studio/scripts?idea=${encodeURIComponent(idea.title)}`}
                  className="btn btn-sm btn-ghost shrink-0"
                >
                  Script
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing saved in this project" hint="Ideas you generate while a project is selected appear here." />
        )}
      </Panel>
    </div>
  );
}
