'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Stat, apiJson, fmtBytes, fmtDate, statusTone } from '@/components/ui';

type Detail = {
  project: any;
  scenes: any[];
  scripts: any[];
  ideas: any[];
  trends: any[];
  assets: any[];
  videos: any[];
  publications: any[];
};

export default function LibraryPage() {
  const { activeId, update, remove } = useProjects();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    try {
      const data = await apiJson<Detail>(`/api/projects/${activeId}`);
      setDetail(data);
      setTitle(data.project.title || '');
      setTopic(data.project.topic || '');
      setNiche(data.project.niche || '');
      setAspect(data.project.aspect || '9:16');
    } catch (err: any) {
      setError(err.message || 'Could not load this project.');
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!activeId) return;
    setError('');
    setInfo('');
    try {
      await update(activeId, { title: title.trim() || 'Untitled project', topic, niche, aspect } as any);
      setInfo('Project saved.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not save the project.');
    }
  }

  async function destroy() {
    if (!activeId) return;
    if (!window.confirm('Delete this project and everything inside it? This cannot be undone.')) return;
    try {
      await remove(activeId);
      setDetail(null);
      setInfo('Project deleted.');
    } catch (err: any) {
      setError(err.message || 'Could not delete the project.');
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 08</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Project &amp; Content Library</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Everything saved in this project: research, ideas, scripts, assets, renders and publications.
        </p>
      </header>

      <ProjectBar />

      {error ? (
        <Notice kind="error" onClose={() => setError('')}>
          {error}
        </Notice>
      ) : null}
      {info ? (
        <Notice kind="success" onClose={() => setInfo('')}>
          {info}
        </Notice>
      ) : null}

      {!detail ? (
        <Panel>
          <Empty title="No project selected" hint="Create or select a project above to see its library." />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Scenes" value={detail.scenes.length} />
            <Stat label="Assets" value={detail.assets.length} />
            <Stat label="Renders" value={detail.videos.length} />
            <Stat label="Publications" value={detail.publications.length} />
          </div>

          <Panel>
            <SectionTitle eyebrow="Project" title="Details" hint="Aspect ratio drives the default for every render." />
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Title">
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Niche">
                <input className="input" value={niche} onChange={(event) => setNiche(event.target.value)} />
              </Field>
              <Field label="Topic">
                <input className="input" value={topic} onChange={(event) => setTopic(event.target.value)} />
              </Field>
              <Field label="Aspect">
                <select className="select" value={aspect} onChange={(event) => setAspect(event.target.value)}>
                  {['9:16', '16:9', '1:1', '4:5'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={save}>
                Save project
              </button>
              <button type="button" className="btn btn-ghost text-rose-300" onClick={destroy}>
                Delete
              </button>
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Renders" title="Video library" />
            {detail.videos.length ? (
              <div className="space-y-3">
                {detail.videos.map((video) => {
                  const spec = video.spec ? (typeof video.spec === 'string' ? JSON.parse(video.spec) : video.spec) : {};
                  const ready = video.status === 'ready' && spec.videoAssetId;
                  return (
                    <div key={video.id} className="panel-tight p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[0.76rem] font-semibold ${statusTone(video.status)}`}>{video.status}</span>
                        <span className="text-[0.66rem] text-slate-500">
                          {fmtDate(video.created_at)} · {fmtBytes(video.bytes)}
                        </span>
                      </div>
                      {ready ? (
                        <video
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black"
                          src={`/api/media/${spec.videoAssetId}`}
                          controls
                          playsInline
                          preload="metadata"
                        />
                      ) : null}
                      {video.error ? <p className="mt-1 text-[0.7rem] text-rose-300">{video.error}</p> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="No renders" hint="Export an MP4 in the production module." />
            )}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Assets" title="Media files" />
            {detail.assets.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.assets.map((asset) => (
                  <a
                    key={asset.id}
                    href={`/api/media/${asset.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="panel-tight overflow-hidden"
                  >
                    {asset.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${asset.id}`} alt={asset.name} className="aspect-square w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-[0.7rem] text-slate-400">
                        {asset.kind}
                      </div>
                    )}
                    <p className="truncate px-1.5 py-1 text-[0.58rem] text-slate-500">{fmtBytes(asset.bytes)}</p>
                  </a>
                ))}
              </div>
            ) : (
              <Empty title="No assets" hint="Generate visuals or audio to fill this library." />
            )}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Writing" title={`${detail.scripts.length} scripts · ${detail.ideas.length} ideas`} />
            <div className="space-y-2">
              {detail.scripts.map((script) => (
                <div key={script.id} className="panel-tight p-3">
                  <p className="text-[0.82rem] font-medium text-slate-200">{script.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-relaxed text-slate-500">
                    {(script.body || '').slice(0, 180)}
                  </p>
                </div>
              ))}
              {!detail.scripts.length && !detail.ideas.length ? (
                <Empty title="Nothing written yet" hint="Ideas and scripts appear here once generated." />
              ) : null}
              {detail.ideas.length ? (
                <ul className="divide-y divide-white/5">
                  {detail.ideas.map((idea) => (
                    <li key={idea.id} className="py-1.5 text-[0.78rem] text-slate-300">
                      {idea.title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Research" title={`${detail.trends.length} saved signals`} />
            {detail.trends.length ? (
              <ul className="divide-y divide-white/5">
                {detail.trends.map((trend) => (
                  <li key={trend.id} className="py-1.5">
                    <p className="text-[0.78rem] text-slate-300">{trend.title}</p>
                    <p className="text-[0.64rem] text-slate-500">{trend.source}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No research saved" hint="Run Trend Research while this project is selected." />
            )}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Publishing" title={`${detail.publications.length} publications`} />
            {detail.publications.length ? (
              <ul className="divide-y divide-white/5">
                {detail.publications.map((publication) => (
                  <li key={publication.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.8rem] text-slate-200">{publication.title}</p>
                      <p className="text-[0.64rem] text-slate-500">{publication.privacy}</p>
                    </div>
                    <span className={`shrink-0 text-[0.7rem] ${statusTone(publication.status)}`}>{publication.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Nothing published" hint="Prepare a draft in the Publish module." />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
