'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiJson } from '@/components/ui';

type TrendItem = { source: string; title: string; url: string; score: number; summary?: string; publishedAt?: string };
type Analysis = { trends: Array<{ trend: string; why: string; angle: string; keywords: string[]; momentum: string }>; note?: string };
type Result = {
  items: TrendItem[];
  sources: Array<{ name: string; ok: boolean; count: number; error?: string }>;
  aiAnalysis: Analysis | null;
  aiProvider: string | null;
};

export default function TrendsPage() {
  const { active, activeId } = useProjects();
  const [topic, setTopic] = useState('');
  const [subreddit, setSubreddit] = useState('technology');
  const [region, setRegion] = useState('US');
  const [includeYouTube, setIncludeYouTube] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Array<{ id: string; title: string; source: string; url: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadSaved = useCallback(async () => {
    if (!activeId) return setSaved([]);
    try {
      const data = await apiJson<{ trends: any[] }>(`/api/trends?projectId=${encodeURIComponent(activeId)}`);
      setSaved(data.trends.slice(0, 20));
    } catch {
      setSaved([]);
    }
  }, [activeId]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  async function research() {
    if (topic.trim().length < 2) return setError('Enter a topic or niche to research.');
    setBusy(true);
    setError('');
    try {
      const data = await apiJson<Result>('/api/trends', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(),
          subreddit,
          region,
          includeYouTube,
          projectId: activeId,
        }),
      });
      setResult(data);
      await loadSaved();
    } catch (err: any) {
      setError(err.message || 'Research failed.');
    } finally {
      setBusy(false);
    }
  }

  const grouped = (result?.items || []).reduce<Record<string, TrendItem[]>>((acc, item) => {
    (acc[item.source] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 01</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Trend Research</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Live signals from Hacker News, Google News, Reddit and Wikipedia. No API key required.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topic or niche">
            <input
              className="input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. AI video tools"
              onKeyDown={(event) => event.key === 'Enter' && research()}
            />
          </Field>
          <Field label="Subreddit">
            <input className="input" value={subreddit} onChange={(event) => setSubreddit(event.target.value)} placeholder="technology" />
          </Field>
          <Field label="Region">
            <select className="select" value={region} onChange={(event) => setRegion(event.target.value)}>
              {['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'FR', 'BR', 'JP', 'NG', 'ZA'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <label className="flex min-h-11 items-center gap-2 text-[0.8rem] text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-violet-500"
                checked={includeYouTube}
                onChange={(event) => setIncludeYouTube(event.target.checked)}
              />
              Include YouTube trending
            </label>
          </div>
        </div>

        {includeYouTube ? (
          <p className="mt-2 text-[0.7rem] leading-relaxed text-amber-200/80">
            YouTube trending needs a server-side YOUTUBE_API_KEY. Without it, this source is skipped and the
            free sources still run.
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={research} disabled={busy}>
            {busy ? 'Scanning sources…' : 'Research trends'}
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

      {result ? (
        <>
          <Panel>
            <SectionTitle eyebrow="Sources" title="What answered" />
            <div className="flex flex-wrap gap-1.5">
              {result.sources.map((source) => (
                <span key={source.name} className={`chip ${source.ok ? 'chip-on' : ''}`}>
                  {source.name}
                  {source.ok ? ` · ${source.count}` : ' · failed'}
                </span>
              ))}
            </div>
            {result.sources.some((source) => !source.ok) ? (
              <p className="mt-2 text-[0.7rem] leading-relaxed text-slate-500">
                {result.sources
                  .filter((source) => !source.ok)
                  .map((source) => `${source.name}: ${source.error}`)
                  .join(' · ')}
              </p>
            ) : null}
          </Panel>

          {result.aiAnalysis?.trends?.length ? (
            <Panel>
              <SectionTitle
                eyebrow={`AI analysis · ${result.aiProvider || 'provider'}`}
                title="Trend clusters"
                hint="Grouped from the headlines above by your connected model."
              />
              <div className="space-y-2">
                {result.aiAnalysis.trends.map((trend, index) => (
                  <div key={index} className="panel-tight p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.86rem] font-semibold text-slate-100">{trend.trend}</p>
                      <span className="chip shrink-0">{trend.momentum}</span>
                    </div>
                    <p className="mt-1 text-[0.76rem] leading-relaxed text-slate-400">{trend.why}</p>
                    <p className="mt-1 text-[0.76rem] leading-relaxed text-violet-200/80">{trend.angle}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(trend.keywords || []).slice(0, 5).map((keyword) => (
                        <span key={keyword} className="chip">
                          {keyword}
                        </span>
                      ))}
                      <Link
                        href={`/studio/ideas?topic=${encodeURIComponent(trend.trend)}`}
                        className="btn btn-sm btn-ghost ml-auto"
                      >
                        Ideate →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel>
              <SectionTitle
                eyebrow="No AI key yet"
                title="Raw signals still work"
                hint="Add an OpenRouter or Gemini free key in Settings to cluster these into angles automatically."
              />
              <Link href="/studio/settings" className="btn btn-sm btn-ghost">
                Open Settings
              </Link>
            </Panel>
          )}

          <Panel>
            <SectionTitle eyebrow="Signals" title={`${result.items.length} live items`} />
            <div className="space-y-3">
              {Object.entries(grouped).map(([source, items]) => (
                <div key={source}>
                  <p className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-slate-500">{source}</p>
                  <ul className="divide-y divide-white/5">
                    {items.map((item, index) => (
                      <li key={`${item.title}-${index}`} className="py-2">
                        <a href={item.url} target="_blank" rel="noreferrer" className="block">
                          <p className="text-[0.82rem] leading-snug text-slate-200">{item.title}</p>
                          <p className="mt-0.5 text-[0.66rem] text-slate-500">
                            {item.score ? `score ${item.score}` : ''} {item.publishedAt ? `· ${item.publishedAt.slice(0, 10)}` : ''}
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      <Panel>
        <SectionTitle eyebrow="Saved" title="Research library" hint={active ? active.title : 'Pick a project to save research.'} />
        {saved.length ? (
          <ul className="divide-y divide-white/5">
            {saved.map((row) => (
              <li key={row.id} className="py-2">
                <p className="text-[0.8rem] text-slate-200">{row.title}</p>
                <p className="text-[0.66rem] text-slate-500">{row.source}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No saved signals yet" hint="Research while a project is selected and results are stored with it." />
        )}
      </Panel>
    </div>
  );
}
