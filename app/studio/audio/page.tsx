'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiForm, apiJson, fmtBytes } from '@/components/ui';

type Asset = { id: string; kind: string; name: string; bytes: number | null; meta: string | null; created_at: number };
type Scene = { id: string; idx: number; text: string | null };

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage'];

export default function AudioPage() {
  const { activeId } = useProjects();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('nova');
  const [speed, setSpeed] = useState(1);
  const [sceneId, setSceneId] = useState('');
  const [seconds, setSeconds] = useState(45);
  const [busy, setBusy] = useState<'' | 'tts' | 'ambient' | 'upload'>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!activeId) {
      setAssets([]);
      setScenes([]);
      return;
    }
    try {
      const [projectData, sceneData] = await Promise.all([
        apiJson<{ assets: Asset[] }>(`/api/projects/${activeId}`),
        apiJson<{ scenes: Scene[] }>(`/api/scenes?projectId=${encodeURIComponent(activeId)}`),
      ]);
      setAssets(projectData.assets.filter((asset) => asset.kind === 'audio'));
      setScenes(sceneData.scenes);
    } catch {
      setAssets([]);
      setScenes([]);
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function speak() {
    if (text.trim().length < 3) return setError('Type the narration text first.');
    setBusy('tts');
    setError('');
    setInfo('');
    try {
      await apiJson('/api/audio', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), voice, speed, projectId: activeId, sceneId: sceneId || undefined }),
      });
      setInfo(sceneId ? 'Narration saved and attached to the scene.' : 'Narration saved to the project.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Narration needs an OpenAI key with TTS access.');
    } finally {
      setBusy('');
    }
  }

  async function ambient() {
    setBusy('ambient');
    setError('');
    setInfo('');
    try {
      await apiJson('/api/audio', {
        method: 'POST',
        body: JSON.stringify({ mode: 'ambient', seconds, projectId: activeId }),
      });
      setInfo('Ambient bed generated locally with ffmpeg — no API key used.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not generate the music bed.');
    } finally {
      setBusy('');
    }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose an audio file first.');
    setBusy('upload');
    setError('');
    setInfo('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (activeId) form.append('projectId', activeId);
      await apiForm('/api/audio', form);
      setInfo('Audio uploaded.');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy('');
    }
  }

  async function remove(id: string) {
    try {
      await apiJson(`/api/visuals?assetId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete that audio file.');
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 06</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Voiceover &amp; Audio Studio</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          AI narration, generated music beds and your own uploads — all usable as scene audio or a background track.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <SectionTitle eyebrow="Narration" title="Text to speech" hint="Uses your OpenAI key (tts-1). No free tier — it is the one paid step in the pipeline." />
        <Field label="Script text">
          <textarea
            className="input min-h-[110px] resize-y text-[0.84rem]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste narration here…"
          />
        </Field>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Field label="Voice">
            <select className="select" value={voice} onChange={(event) => setVoice(event.target.value)}>
              {VOICES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Speed · ${speed.toFixed(1)}x`}>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              className="mt-3 w-full accent-violet-500"
            />
          </Field>
          <Field label="Attach to scene">
            <select className="select" value={sceneId} onChange={(event) => setSceneId(event.target.value)}>
              <option value="">Don’t attach</option>
              {scenes.map((scene, index) => (
                <option key={scene.id} value={scene.id}>
                  Scene {index + 1}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" className="btn btn-primary mt-3 w-full" onClick={speak} disabled={busy === 'tts'}>
          {busy === 'tts' ? 'Synthesising…' : 'Generate narration'}
        </button>
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Music" title="Ambient bed" hint="Synthesised locally by ffmpeg — free, and no key required." />
        <Field label={`Length · ${seconds}s`}>
          <input
            type="range"
            min={10}
            max={180}
            step={5}
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="w-full accent-violet-500"
          />
        </Field>
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={ambient} disabled={busy === 'ambient'}>
          {busy === 'ambient' ? 'Generating…' : 'Generate music bed'}
        </button>
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Upload" title="Bring your own audio" hint="MP3, WAV, M4A or OGG up to 30 MB." />
        <input ref={fileRef} type="file" accept="audio/*" className="input !py-2 text-[0.8rem]" />
        <button type="button" className="btn btn-ghost mt-2 w-full" onClick={upload} disabled={busy === 'upload'}>
          {busy === 'upload' ? 'Uploading…' : 'Upload audio'}
        </button>
      </Panel>

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
      {busy ? <Spinner label="Working…" /> : null}

      <Panel>
        <SectionTitle eyebrow="Library" title={`${assets.length} audio files`} />
        {assets.length ? (
          <div className="space-y-2">
            {assets.map((asset) => (
              <div key={asset.id} className="panel-tight p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[0.8rem] text-slate-200">{asset.name}</p>
                  <button type="button" className="shrink-0 text-[0.66rem] text-rose-300" onClick={() => remove(asset.id)}>
                    Delete
                  </button>
                </div>
                <audio className="mt-2 w-full" src={`/api/media/${asset.id}`} controls preload="none" />
                <p className="mt-1 text-[0.62rem] text-slate-500">{fmtBytes(asset.bytes)}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No audio yet" hint="Generate a narration or a free music bed to get started." />
        )}
      </Panel>
    </div>
  );
}
