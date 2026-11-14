'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProjectBar, useProjects } from '@/components/project-context';
import { Empty, Field, Notice, Panel, SectionTitle, Spinner, apiJson, fmtDate, statusTone } from '@/components/ui';

type Video = { id: string; status: string; duration: number | null; created_at: number };
type Publication = {
  id: string;
  video_id: string;
  title: string;
  description: string | null;
  tags: string | null;
  privacy: string;
  scheduled_at: number | null;
  status: string;
  error: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  created_at: number;
};
type YoutubeState = { connection: { connected: boolean; channelTitle?: string | null } | null; configured: boolean };

export default function PublishPage() {
  const { activeId } = useProjects();
  const [videos, setVideos] = useState<Video[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [youtube, setYoutube] = useState<YoutubeState | null>(null);
  const [videoId, setVideoId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      const [videoData, youtubeData] = await Promise.all([
        activeId
          ? apiJson<{ videos: Video[] }>(`/api/videos?projectId=${encodeURIComponent(activeId)}`)
          : Promise.resolve({ videos: [] as Video[] }),
        apiJson<YoutubeState>('/api/youtube'),
      ]);
      setVideos(videoData.videos.filter((video) => video.status === 'ready'));
      setYoutube(youtubeData);
      if (activeId) {
        const publishData = await apiJson<{ publications: Publication[] }>(
          `/api/publish?projectId=${encodeURIComponent(activeId)}`,
        );
        setPublications(publishData.publications);
      } else {
        setPublications([]);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load publishing data.');
    }
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function prepare() {
    if (!videoId) return setError('Choose a finished render first.');
    if (title.trim().length < 3) return setError('Give the video a title.');
    setBusy('prepare');
    setError('');
    setInfo('');
    try {
      await apiJson('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          title: title.trim(),
          description,
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          privacy,
          scheduledAt: scheduledAt || undefined,
          projectId: activeId,
        }),
      });
      setInfo('Draft prepared. Nothing is uploaded until you approve it below.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not prepare the publication.');
    } finally {
      setBusy('');
    }
  }

  async function approve(publication: Publication) {
    const confirmed = window.confirm(
      `Upload “${publication.title}” to YouTube as ${publication.privacy}? This uses your connected channel.`,
    );
    if (!confirmed) return;
    setBusy(publication.id);
    setError('');
    setInfo('');
    try {
      const result = await apiJson<{ publication: Publication; result?: { url?: string } }>('/api/publish', {
        method: 'PATCH',
        body: JSON.stringify({ id: publication.id, approve: true }),
      });
      setInfo(result.result?.url ? `Published: ${result.result.url}` : 'Upload finished.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
      await load();
    } finally {
      setBusy('');
    }
  }

  async function cancel(publication: Publication) {
    try {
      await apiJson('/api/publish', { method: 'PATCH', body: JSON.stringify({ id: publication.id, action: 'cancel' }) });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not cancel that publication.');
    }
  }

  async function disconnect() {
    try {
      await apiJson('/api/youtube', { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not disconnect YouTube.');
    }
  }

  const connected = Boolean(youtube?.connection?.connected);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Module 07</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Publish</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Official YouTube OAuth and Data API. Every upload needs your explicit approval.
        </p>
      </header>

      <ProjectBar />

      <Panel>
        <SectionTitle eyebrow="Channel" title={connected ? 'YouTube connected' : 'Connect YouTube'} />
        {connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.82rem] text-slate-300">{youtube?.connection?.channelTitle || 'Channel linked'}</p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[0.78rem] leading-relaxed text-slate-400">
              {youtube?.configured
                ? 'Sign in with Google to authorise uploads. Tokens are stored encrypted and can be revoked any time.'
                : 'Server-side GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set, so OAuth cannot start yet. Everything else in the pipeline still works.'}
            </p>
            {youtube?.configured ? (
              <a href="/api/youtube/connect" className="btn btn-primary block w-full text-center">
                Connect YouTube channel
              </a>
            ) : (
              <p className="text-[0.72rem] text-amber-200/80">
                Add the OAuth client in Google Cloud Console, then set the two environment variables.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Prepare" title="Upload metadata" hint="Saved as a draft first — this step never touches YouTube." />
        <div className="space-y-2">
          <Field label="Finished render">
            <select className="select" value={videoId} onChange={(event) => setVideoId(event.target.value)}>
              <option value="">Select a ready MP4</option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.duration ? `${video.duration.toFixed(1)}s` : 'render'} · {fmtDate(video.created_at)} · {video.id.slice(0, 6)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Video title" />
          </Field>
          <Field label="Description">
            <textarea
              className="input min-h-[90px] resize-y text-[0.82rem]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4900}
              placeholder="What the viewer gets, links, credits…"
            />
          </Field>
          <Field label="Tags" hint="Comma separated.">
            <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="ai, tools, tutorial" />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Privacy">
              <select className="select" value={privacy} onChange={(event) => setPrivacy(event.target.value)}>
                {['private', 'unlisted', 'public'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Schedule (optional)">
              <input
                type="datetime-local"
                className="input"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </Field>
          </div>
        </div>
        <button type="button" className="btn btn-primary mt-3 w-full" onClick={prepare} disabled={busy === 'prepare'}>
          {busy === 'prepare' ? 'Saving draft…' : 'Prepare draft'}
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
      {busy && busy !== 'prepare' ? <Spinner label="Uploading to YouTube…" /> : null}

      <Panel>
        <SectionTitle eyebrow="Queue" title={`${publications.length} publications`} />
        {publications.length ? (
          <div className="space-y-2">
            {publications.map((publication) => (
              <div key={publication.id} className="panel-tight p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[0.84rem] font-semibold leading-snug text-slate-100">{publication.title}</p>
                  <span className={`shrink-0 text-[0.7rem] font-semibold ${statusTone(publication.status)}`}>
                    {publication.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.66rem] text-slate-500">
                  {publication.privacy}
                  {publication.scheduled_at ? ` · scheduled ${fmtDate(publication.scheduled_at)}` : ''}
                </p>
                {publication.error ? <p className="mt-1 text-[0.7rem] text-rose-300">{publication.error}</p> : null}
                {publication.youtube_url ? (
                  <a
                    href={publication.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-[0.72rem] text-cyan-300 underline"
                  >
                    Watch on YouTube
                  </a>
                ) : null}
                {publication.status === 'draft' ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex-1"
                      onClick={() => approve(publication)}
                      disabled={!connected || busy === publication.id}
                    >
                      {busy === publication.id ? 'Uploading…' : 'Approve & upload'}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => cancel(publication)}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                {!connected && publication.status === 'draft' ? (
                  <p className="mt-1 text-[0.68rem] text-amber-200/80">Connect a channel to enable the upload button.</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nothing queued" hint="Prepare a draft above, review the metadata, then approve the upload." />
        )}
      </Panel>
    </div>
  );
}
