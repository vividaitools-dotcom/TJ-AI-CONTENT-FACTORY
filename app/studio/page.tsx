'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Panel, SectionTitle, Stat, apiJson, fmtDate } from '@/components/ui';

type Me = {
  user: { id: string; email: string; name: string | null } | null;
  providers: string[];
  counts: { projects: number; videos: number; assets: number };
  youtube: { connected: boolean; channelTitle?: string | null } | null;
  googleOauthConfigured: boolean;
  ffmpegReady: boolean;
  recent: Array<{ module: string; action: string; detail: string; created_at: number }>;
};

const PIPELINE = [
  { href: '/studio/trends', step: '01', title: 'Trend Research', body: 'Find what is moving right now.' },
  { href: '/studio/ideas', step: '02', title: 'Idea Generator', body: 'Turn signals into scored concepts.' },
  { href: '/studio/scripts', step: '03', title: 'Script Writer', body: 'Hook, body, CTA, scene breakdown.' },
  { href: '/studio/visuals', step: '04', title: 'Visuals', body: 'AI images or free designer posters.' },
  { href: '/studio/video', step: '05', title: 'Production', body: 'Motion, transitions, MP4 export.' },
  { href: '/studio/audio', step: '06', title: 'Audio Studio', body: 'Narration, music beds, uploads.' },
  { href: '/studio/publish', step: '07', title: 'Publish', body: 'YouTube uploads you approve.' },
  { href: '/studio/library', step: '08', title: 'Library', body: 'Everything you have made.' },
];

export default function StudioDashboard() {
  const { active, projects } = useProjects();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiJson<Me>('/api/me')
      .then(setMe)
      .catch((err) => setError(err.message || 'Could not load studio status.'));
  }, []);

  const providerLabel = me?.providers.length ? me.providers.join(', ') : 'none yet';

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Studio</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          <span className="brand-text">CONTENT FACTORY</span> console
        </h1>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-slate-400">
          {me?.user ? `Signed in as ${me.user.email}. ` : ''}
          Discover, create, produce and publish without leaving this page.
        </p>
      </header>

      {error ? <p className="text-[0.8rem] text-rose-300">{error}</p> : null}

      <ProjectBar />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Projects" value={me?.counts.projects ?? projects.length} />
        <Stat label="Renders" value={me?.counts.videos ?? 0} />
        <Stat label="Assets" value={me?.counts.assets ?? 0} />
        <Stat
          label="AI keys"
          value={me ? me.providers.length : '—'}
          accent={me?.providers.length ? 'text-emerald-300' : 'text-amber-300'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle
            eyebrow="Pipeline"
            title="Eight connected modules"
            hint="Each module saves into the selected project, so the next step already has your work."
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PIPELINE.map((item) => (
              <Link key={item.href} href={item.href} className="panel-tight block p-3 transition active:scale-[0.98]">
                <p className="text-[0.6rem] font-bold tracking-[0.18em] text-violet-300/70">{item.step}</p>
                <p className="mt-1 text-[0.82rem] font-semibold text-slate-100">{item.title}</p>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-slate-500">{item.body}</p>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel>
            <SectionTitle eyebrow="System" title="Readiness" />
            <ul className="space-y-2 text-[0.8rem]">
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-400">ffmpeg engine</span>
                <span className={me?.ffmpegReady ? 'text-emerald-300' : 'text-amber-300'}>
                  {me ? (me.ffmpegReady ? 'ready' : 'missing') : '…'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-400">AI providers</span>
                <span className={me?.providers.length ? 'text-emerald-300' : 'text-amber-300'}>{providerLabel}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-400">YouTube</span>
                <span className={me?.youtube?.connected ? 'text-emerald-300' : 'text-slate-400'}>
                  {me?.youtube?.connected ? me.youtube.channelTitle || 'connected' : 'not connected'}
                </span>
              </li>
            </ul>
            {!me?.providers.length ? (
              <Link href="/studio/settings" className="btn btn-sm btn-primary mt-3 w-full">
                Add a free AI key
              </Link>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Active project" title={active?.title || 'No project yet'} />
            {active ? (
              <div className="space-y-2 text-[0.78rem] text-slate-400">
                <p>
                  Format <span className="text-slate-200">{active.aspect}</span> · status{' '}
                  <span className="text-slate-200">{active.status}</span>
                </p>
                <p>Updated {fmtDate(active.updated_at)}</p>
                <div className="flex gap-2">
                  <Link href="/studio/video" className="btn btn-sm btn-primary flex-1">
                    Produce
                  </Link>
                  <Link href="/studio/library" className="btn btn-sm btn-ghost flex-1">
                    Open
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-[0.78rem] leading-relaxed text-slate-400">
                Create a project above to unlock saving across every module.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel>
        <SectionTitle eyebrow="Activity" title="Recent work" hint="The last things saved in this account." />
        {me?.recent?.length ? (
          <ul className="divide-y divide-white/5">
            {me.recent.map((entry, index) => (
              <li key={index} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[0.8rem] text-slate-200">{entry.detail || entry.action}</p>
                  <p className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">{entry.module}</p>
                </div>
                <span className="shrink-0 text-[0.68rem] text-slate-500">{fmtDate(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.78rem] text-slate-500">Nothing yet — start with Trend Research.</p>
        )}
      </Panel>
    </div>
  );
}
