'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, ProgressBar, SectionTitle, Spinner, apiJson, fmtBytes, statusTone } from '@/components/ui';

type Scene = {
  id: string;
  idx: number;
  text: string | null;
  visual_prompt: string | null;
  duration: number;
  motion: string;
  transition: string;
  image_asset_id: string | null;
  audio_asset_id: string | null;
};

type Asset = { id: string; kind: string; name: string; bytes: number | null; meta: string | null };
type Video = {
  id: string;
  status: string;
  progress: number;
  stage: string | null;
  error: string | null;
  duration: number | null;
  bytes: number | null;
  spec: any;
  url?: string | null;
  thumbnailUrl?: string | null;
  created_at: number;
};

const MOTIONS = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left', 'pan-up', 'pan-down', 'static'];
const TRANSITIONS = ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'circleopen', 'pixelize', 'none'];
const ASPECTS = ['9:16', '16:9', '1:1', '4:5'];

export default function VideoPage() {
  const { active, activeId } = useProjects();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [aspect, setAspect] = useState('9:16');
  const [subtitles, setSubtitles] = useState(true);
  const [musicAssetId, setMusicAssetId] = useState('');
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active?.aspect) setAspect(active.aspect);
  }, [active?.aspect]);

  const load = useCallback(async () => {
    if (!activeId) {
      setScenes([]);
      setAssets([]);
      setVideos([]);
      return;
    }
    try {
      const [sceneData, projectData, videoData] = await Promise.all([
        apiJson<{ scenes: Scene[] }>(`/api/scenes?projectId=${encodeURIComponent(activeId)}`),
        apiJson<{ assets: Asset[] }>(`/api/projects/${activeId}`),
        apiJson<{ videos: Video[] }>(`/api/videos?projectId=${encodeURIComponent(activeId)}`),
      ]);
      setScenes(sceneData.scenes);
      setAssets(projectData.assets);
      setVideos(videoData.videos);
    } catch (err: any) {
      setError(err.message || 'Could not load the production workspace.');
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  const rendering = videos.some((video) => video.status === 'queued' || video.status === 'rendering');

  useEffect(() => {
    if (!rendering) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => {
      load();
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [rendering, load]);

  const images = assets.filter((asset) => asset.kind === 'image');
  const audioAssets = assets.filter((asset) => asset.kind === 'audio');

  async function addScene() {
    if (!activeId) return setError('Open or create a project first.');
    setError('');
    try {
      await apiJson('/api/scenes', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeId,
          text: 'New scene narration',
          duration: 4,
          motion: 'zoom-in',
          transition: 'fade',
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not add the scene.');
    }
  }

  async function patchScene(scene: Scene, patch: Partial<Scene>) {
    setScenes((current) => current.map((row) => (row.id === scene.id ? { ...row, ...patch } : row)));
    try {
      await apiJson('/api/scenes', {
        method: 'PATCH',
        body: JSON.stringify({ sceneId: scene.id, ...patch }),
      });
    } catch (err: any) {
      setError(err.message || 'Could not save that scene change.');
    }
  }

  async function deleteScene(id: string) {
    try {
      await apiJson(`/api/scenes?sceneId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete the scene.');
    }
  }

  async function render() {
    if (!activeId) return setError('Open or create a project first.');
    if (!scenes.length) return setError('Add at least one scene before rendering.');
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiJson('/api/videos', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeId,
          aspect,
          subtitles,
          musicAssetId: musicAssetId || undefined,
          musicVolume,
          sceneIds: scenes.map((scene) => scene.id),
        }),
      });
      setInfo('Render queued. Progress updates every few seconds.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not start the render.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 05</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Video Editor &amp; Production</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Scene timeline, motion, transitions, subtitles and a real MP4 export rendered on the server with ffmpeg.
        </p>
      </header>

      <ProjectBar />

      {!activeId ? (
        <Panel>
          <Empty title="No project selected" hint="Create a project above — scenes and renders live inside it." />
        </Panel>
      ) : (
        <>
          <Panel>
            <SectionTitle
              eyebrow="Timeline"
              title={`${scenes.length} scenes`}
              hint="Each scene becomes one clip. Images you generated are available in the picker."
              action={
                <button type="button" className="btn btn-sm btn-ghost" onClick={addScene}>
                  + Scene
                </button>
              }
            />
            {scenes.length ? (
              <div className="space-y-2">
                {scenes.map((scene, index) => (
                  <div key={scene.id} className="panel-tight p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="chip">Scene {index + 1}</span>
                      <button type="button" className="text-[0.68rem] text-rose-300" onClick={() => deleteScene(scene.id)}>
                        Remove
                      </button>
                    </div>

                    <textarea
                      className="input min-h-[68px] resize-y text-[0.82rem]"
                      value={scene.text || ''}
                      onChange={(event) => patchScene(scene, { text: event.target.value })}
                      placeholder="Narration for this scene"
                    />

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Duration (s)">
                        <input
                          type="number"
                          min={1.2}
                          max={30}
                          step={0.2}
                          className="input !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.duration}
                          onChange={(event) => patchScene(scene, { duration: Number(event.target.value) })}
                        />
                      </Field>
                      <Field label="Motion">
                        <select
                          className="select !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.motion}
                          onChange={(event) => patchScene(scene, { motion: event.target.value })}
                        >
                          {MOTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Transition">
                        <select
                          className="select !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.transition}
                          onChange={(event) => patchScene(scene, { transition: event.target.value })}
                        >
                          {TRANSITIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Image">
                        <select
                          className="select !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.image_asset_id || ''}
                          onChange={(event) => patchScene(scene, { image_asset_id: event.target.value || null })}
                        >
                          <option value="">Auto (designer card)</option>
                          {images.map((image) => (
                            <option key={image.id} value={image.id}>
                              {image.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Scene audio">
                        <select
                          className="select !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.audio_asset_id || ''}
                          onChange={(event) => patchScene(scene, { audio_asset_id: event.target.value || null })}
                        >
                          <option value="">None</option>
                          {audioAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Visual prompt">
                        <input
                          className="input !min-h-9 !py-1.5 text-[0.82rem]"
                          value={scene.visual_prompt || ''}
                          onChange={(event) => patchScene(scene, { visual_prompt: event.target.value })}
                          placeholder="Card background idea"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Timeline is empty"
                hint="Write a script first — its scenes land here automatically — or add scenes manually."
                action={
                  <Link href="/studio/scripts" className="btn btn-sm btn-primary">
                    Write a script
                  </Link>
                }
              />
            )}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Render" title="Export MP4" hint="Rendering runs in the background; this page follows progress." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aspect ratio">
                <select className="select" value={aspect} onChange={(event) => setAspect(event.target.value)}>
                  {ASPECTS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Background music">
                <select className="select" value={musicAssetId} onChange={(event) => setMusicAssetId(event.target.value)}>
                  <option value="">None</option>
                  {audioAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Music volume · ${Math.round(musicVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={Math.round(musicVolume * 100)}
                  onChange={(event) => setMusicVolume(Number(event.target.value) / 100)}
                  className="mt-3 w-full accent-violet-500"
                />
              </Field>
              <div className="flex items-end">
                <label className="flex min-h-11 items-center gap-2 text-[0.8rem] text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-500"
                    checked={subtitles}
                    onChange={(event) => setSubtitles(event.target.checked)}
                  />
                  Burn in subtitles
                </label>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={render} disabled={busy || !scenes.length}>
                {busy ? 'Starting…' : 'Render MP4'}
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
            {info ? (
              <div className="mt-3">
                <Notice kind="success" onClose={() => setInfo('')}>
                  {info}
                </Notice>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Renders" title={`${videos.length} exports`} />
            {videos.length ? (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div key={video.id} className="panel-tight p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[0.78rem] font-semibold ${statusTone(video.status)}`}>{video.status}</span>
                      <span className="text-[0.66rem] text-slate-500">
                        {video.duration ? `${video.duration.toFixed(1)}s` : ''} {video.bytes ? `· ${fmtBytes(video.bytes)}` : ''}
                      </span>
                    </div>
                    {video.status !== 'ready' ? (
                      <div className="mt-2 space-y-1">
                        <ProgressBar value={video.progress || 0} />
                        <p className="text-[0.68rem] text-slate-500">{video.stage || 'Working…'}</p>
                      </div>
                    ) : null}
                    {video.error ? <p className="mt-1 text-[0.7rem] text-rose-300">{video.error}</p> : null}
                    {video.status === 'ready' && video.url ? (
                      <div className="mt-2 space-y-2">
                        <video
                          className="w-full rounded-lg border border-white/10 bg-black"
                          src={video.url}
                          controls
                          playsInline
                          preload="metadata"
                          poster={video.thumbnailUrl || undefined}
                        />
                        <div className="flex gap-2">
                          <a href={video.url} download={`tjcf-${video.id}.mp4`} className="btn btn-sm btn-ghost flex-1">
                            Download MP4
                          </a>
                          <Link href="/studio/publish" className="btn btn-sm btn-primary flex-1">
                            Publish
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No renders yet" hint="Configure the timeline above and export your first MP4." />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
