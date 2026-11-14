'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiJson, fmtBytes } from '@/components/ui';

type ImageAsset = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  meta: string | null;
  created_at: number;
};

const ASPECTS = ['9:16', '16:9', '1:1', '4:5'];
const PALETTES = ['violet', 'cyan', 'ember', 'mint', 'mono', 'sunset'];

export default function VisualsPage() {
  const { active, activeId } = useProjects();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [palette, setPalette] = useState('violet');
  const [mode, setMode] = useState<'designer' | 'ai'>('designer');
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastUrl, setLastUrl] = useState('');

  useEffect(() => {
    if (active?.aspect) setAspect(active.aspect);
  }, [active?.aspect]);

  const load = useCallback(async () => {
    try {
      const query = activeId ? `?projectId=${encodeURIComponent(activeId)}` : '';
      const data = await apiJson<{ images: ImageAsset[] }>(`/api/visuals${query}`);
      setImages(data.images);
    } catch {
      setImages([]);
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    if (!title.trim() && !prompt.trim()) return setError('Add a headline or a visual prompt.');
    setBusy(true);
    setError('');
    try {
      const data = await apiJson<{ asset: ImageAsset; url: string }>('/api/visuals', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeId,
          title: title.trim(),
          subtitle: subtitle.trim(),
          prompt: prompt.trim() || title.trim(),
          aspect,
          palette,
          mode,
        }),
      });
      setLastUrl(data.url);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not create the visual.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiJson(`/api/visuals?assetId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete that image.');
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 04</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Image &amp; Visual Generator</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          The built-in Designer renders posters with ffmpeg and needs no key at all. AI images use your OpenAI or
          Gemini key.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(['designer', 'ai'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded-lg px-3 py-2 text-[0.78rem] font-semibold transition ${
                mode === option ? 'bg-white/10 text-white' : 'text-slate-400'
              }`}
            >
              {option === 'designer' ? 'Designer · free' : 'AI image · key'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Headline">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. LOCAL AI IS HERE" />
          </Field>
          <Field label="Subtitle (optional)">
            <input className="input" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Small models, big results" />
          </Field>
          <Field label="Prompt / seed">
            <input className="input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the frame" />
          </Field>
          <Field label="Aspect">
            <select className="select" value={aspect} onChange={(event) => setAspect(event.target.value)}>
              {ASPECTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          {mode === 'designer' ? (
            <Field label="Palette">
              <select className="select" value={palette} onChange={(event) => setPalette(event.target.value)}>
                {PALETTES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={generate} disabled={busy}>
            {busy ? (mode === 'ai' ? 'Generating image…' : 'Designing…') : 'Generate visual'}
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

      {lastUrl ? (
        <Panel>
          <SectionTitle eyebrow="Latest" title="Fresh frame" hint="Assign it to a scene in the production module." />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lastUrl} alt="Generated visual" className="mx-auto max-h-[420px] rounded-xl border border-white/10" />
        </Panel>
      ) : null}

      <Panel>
        <SectionTitle eyebrow="Gallery" title={`${images.length} visuals`} hint="Tap a thumbnail to open it full size." />
        {images.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((image) => (
              <div key={image.id} className="panel-tight overflow-hidden">
                <a href={`/api/media/${image.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/media/${image.id}`} alt={image.name} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                </a>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="truncate text-[0.62rem] text-slate-500">
                    {image.width}×{image.height} · {fmtBytes(image.bytes)}
                  </span>
                  <button type="button" className="text-[0.62rem] text-rose-300" onClick={() => remove(image.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No visuals yet" hint="The free Designer works without any API key — try a headline above." />
        )}
      </Panel>
    </div>
  );
}
