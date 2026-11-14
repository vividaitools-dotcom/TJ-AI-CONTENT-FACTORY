'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiJson } from '@/components/ui';

type Script = {
  id: string;
  title: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  tags: string | null;
  duration_seconds?: number | null;
  created_at: number;
};

export default function ScriptsPage() {
  const { activeId } = useProjects();
  const [topic, setTopic] = useState('');
  const [idea, setIdea] = useState('');
  const [tone, setTone] = useState('confident, fast, informative');
  const [seconds, setSeconds] = useState(45);
  const [language, setLanguage] = useState('English');
  const [script, setScript] = useState<(Script & { scenesSaved?: number }) | null>(null);
  const [history, setHistory] = useState<Script[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('topic')) setTopic(params.get('topic') || '');
    if (params.get('idea')) setIdea(params.get('idea') || '');
  }, []);

  const load = useCallback(async () => {
    if (!activeId) {
      setHistory([]);
      return;
    }
    try {
      const data = await apiJson<{ scripts: Script[] }>(`/api/scripts?projectId=${encodeURIComponent(activeId)}`);
      setHistory(data.scripts);
    } catch {
      setHistory([]);
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function write() {
    if (topic.trim().length < 2) return setError('Enter the topic for the script.');
    setBusy(true);
    setError('');
    try {
      const data = await apiJson<{ script: Script; scenesSaved: number }>('/api/scripts', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(),
          idea: idea.trim(),
          tone,
          seconds,
          language,
          projectId: activeId,
        }),
      });
      setScript({ ...data.script, scenesSaved: data.scenesSaved });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not write the script.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!script) return;
    const text = [script.hook, '', script.body, '', script.cta].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 03</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">AI Script Writer</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Hook, narration and CTA in one pass — saved scenes feed the production engine directly.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topic">
            <input className="input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. why small models win" />
          </Field>
          <Field label="Chosen idea (optional)" hint="Prefilled when you come from the idea board.">
            <input className="input" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Idea title" />
          </Field>
          <Field label="Tone">
            <input className="input" value={tone} onChange={(event) => setTone(event.target.value)} />
          </Field>
          <Field label="Language">
            <input className="input" value={language} onChange={(event) => setLanguage(event.target.value)} />
          </Field>
          <Field label={`Target length · ${seconds}s`}>
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
              className="mt-3 w-full accent-violet-500"
            />
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={write} disabled={busy}>
            {busy ? 'Writing…' : 'Write script'}
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

      {script ? (
        <Panel>
          <SectionTitle
            eyebrow={script.scenesSaved ? `${script.scenesSaved} scenes saved` : 'Script'}
            title={script.title}
            action={
              <button type="button" className="btn btn-sm btn-ghost" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            }
          />
          {script.hook ? (
            <p className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-[0.84rem] leading-relaxed text-violet-100">
              {script.hook}
            </p>
          ) : null}
          <div className="mt-3 whitespace-pre-wrap text-[0.84rem] leading-relaxed text-slate-300">{script.body}</div>
          {script.cta ? (
            <p className="mt-3 text-[0.8rem] leading-relaxed text-cyan-200/80">CTA: {script.cta}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(script.tags ? JSON.parse(script.tags) : []).map((tag: string) => (
              <span key={tag} className="chip">
                #{tag}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/studio/visuals" className="btn btn-sm btn-ghost flex-1">
              Visuals
            </Link>
            <Link href="/studio/video" className="btn btn-sm btn-primary flex-1">
              Produce video
            </Link>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <SectionTitle eyebrow="Saved" title="Script history" />
        {history.length ? (
          <ul className="divide-y divide-white/5">
            {history.map((row) => (
              <li key={row.id} className="py-2">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setScript({ ...row, scenesSaved: 0 })}
                >
                  <p className="text-[0.82rem] font-medium text-slate-200">{row.title}</p>
                  <p className="line-clamp-2 text-[0.7rem] leading-relaxed text-slate-500">
                    {(row.body || '').slice(0, 160)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No scripts yet" hint="Generate one and it is stored in the selected project." />
        )}
      </Panel>
    </div>
  );
}
