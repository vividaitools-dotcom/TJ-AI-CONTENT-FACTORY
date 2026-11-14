'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Notice } from './ui';

const FEATURES = [
  { key: '01', title: 'Trend Research', body: 'Live signals from Hacker News, Google News, Reddit and Wikipedia — no API key needed.' },
  { key: '02', title: 'AI Idea Generator', body: 'Scored, platform-ready concepts from your own AI provider key.' },
  { key: '03', title: 'Script Writer', body: 'Hooks, narration and a scene-by-scene breakdown in one pass.' },
  { key: '04', title: 'Visual Generator', body: 'AI images, or free ffmpeg-designed posters with zero keys.' },
  { key: '05', title: 'Production Engine', body: 'Multi-image motion, transitions, subtitles and real MP4 export.' },
  { key: '06', title: 'Audio Studio', body: 'AI narration, generated ambient beds and your own uploads.' },
  { key: '07', title: 'Publishing', body: 'Official YouTube OAuth uploads, scheduled and approved by you.' },
  { key: '08', title: 'Content Library', body: 'Every project, script, asset and render in one place.' },
];

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = mode === 'signup' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      router.push('/studio');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="safe-top mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 px-4 pb-12 pt-8 sm:px-6 lg:flex-row lg:items-center lg:gap-12 lg:pt-16">
      <section className="flex-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-emerald-400" />
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-slate-300">
            Independent AI studio
          </span>
        </div>

        <h1 className="mt-5 text-[2.1rem] font-black leading-[1.05] tracking-tight sm:text-5xl">
          <span className="brand-text">TJ AI</span>
          <br />
          CONTENT FACTORY
        </h1>
        <p className="mt-3 text-[0.72rem] font-bold uppercase tracking-[0.34em] text-slate-400">
          Discover · Create · Produce · Publish
        </p>
        <p className="mt-5 max-w-lg text-[0.92rem] leading-relaxed text-slate-400">
          One pipeline from trending topic to finished MP4. Bring your own AI keys, or start with the free
          tools that need none at all.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-2">
          {FEATURES.map((feature) => (
            <div key={feature.key} className="panel-tight p-3">
              <p className="text-[0.6rem] font-bold tracking-[0.18em] text-violet-300/70">{feature.key}</p>
              <p className="mt-1 text-[0.8rem] font-semibold text-slate-200">{feature.title}</p>
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-slate-500">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full lg:max-w-sm">
        <form onSubmit={submit} className="panel brand-ring p-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {(['signup', 'signin'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMode(option);
                  setError('');
                }}
                className={`rounded-lg px-3 py-2 text-[0.78rem] font-semibold transition ${
                  mode === option ? 'bg-white/10 text-white' : 'text-slate-400'
                }`}
              >
                {option === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === 'signup' ? (
              <label className="block">
                <span className="label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Creator name"
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@studio.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
          </div>

          {error ? (
            <div className="mt-3">
              <Notice kind="error" onClose={() => setError('')}>
                {error}
              </Notice>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Enter the factory' : 'Sign in'}
          </button>

          <p className="mt-3 text-center text-[0.68rem] leading-relaxed text-slate-500">
            Your account, database and keys are private to this app. AI keys are encrypted at rest and only
            used for your own requests.
          </p>
        </form>

        <p className="mt-4 text-center text-[0.66rem] leading-relaxed text-slate-600">
          No credit card. No paid subscription. Free tiers only.
        </p>
      </section>
    </main>
  );
}
