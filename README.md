# TJ AI CONTENT FACTORY

**DISCOVER. CREATE. PRODUCE. PUBLISH.**

An independent AI content studio that takes a topic from live trend research to a finished, exportable MP4 and an approved YouTube upload. Premium dark, mobile-first interface built to feel native on iPhone Safari.

This is a standalone project: its own repository, database, authentication, API configuration and deployment target. It does not import from, connect to, or modify any other application.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | One codebase for UI and API, runs on any free Node host |
| Styling | Tailwind CSS 4 (CSS-first `@theme` tokens) | Zero-runtime styling, safe-area aware for iPhone |
| Database | SQLite via `sql.js` (WASM) at `data/app.db` | No external database service, no account, no cost |
| Video | System `ffmpeg` / `ffprobe` | Open source, no render service, H.264 MP4 export |
| Auth | Own session cookie + scrypt password hashing | Independent from every other app |
| Secrets | AES-256-GCM encrypted user API keys | Keys are stored encrypted, never returned to the browser |

Everything above is free and open source. No paid service, subscription or credit card is required by this codebase.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # optional, see configuration
npm run dev                  # http://localhost:3000
```

Requirements: Node.js 20.9+ and `ffmpeg`/`ffprobe` on `PATH`.

```bash
npm run build     # production build (also type-checks every route)
npm run selftest  # end-to-end HTTP flow: register -> project -> scenes -> render -> MP4
npx tsx scripts/render-test.ts   # production engine render proof (ffprobe validated)
```

`scripts/render-test.ts` renders real posters, a music bed, a 9:16 MP4 with subtitles and audio, a thumbnail, and a 16:9 long-form MP4, then validates each with `ffprobe`.

---

## Configuration

Everything AI-related is per user and entered in **Settings → API Keys** inside the app. The server only needs:

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_SECRET` | Recommended | Signs sessions and derives the key-encryption key. Set this in production or encrypted keys will not survive a restart. |
| `DATA_DIR` | Optional | Where the SQLite file and generated media live (default `./data`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For YouTube | Free Google Cloud OAuth 2.0 web client with YouTube Data API v3 enabled; redirect URI `<app url>/api/youtube/callback`. |
| `YOUTUBE_API_KEY` | Optional | Adds the free YouTube trending source to Trend Research. |

No AI provider key is needed to run the app: trend research, poster/visual design, video production, MP4 export, subtitles, music and the library all work without one.

---

## The eight modules

### 1. Trend Research — works with no API key
Aggregates live signals from Hacker News, Google News, Reddit and Wikipedia, de-duplicates them and scores them by recency and engagement. Optional AI analysis turns a raw list into angles and gaps. Results are stored per project.

### 2. AI Idea Generator — needs your own AI key
Generates scored, platform-aware concepts (title, hook, angle, format) from a topic, audience and optional trend context, then saves them to the project.

### 3. AI Script Writer — needs your own AI key
Produces hook, body, CTA and tags, and writes timed **scenes** straight into the project so the production engine has something to render.

### 4. Image and Visual Generator — free designer works offline
- **Designer mode (no key):** real 1080×1920 / 1920×1080 PNG posters rendered with ffmpeg — gradient mesh, palette, headline, kicker, watermark.
- **AI mode (your key):** OpenAI images, Google Gemini image models, or any OpenAI-compatible image endpoint you configure.

### 5. Video Editor and Production Engine — fully local
Multi-image videos, per-scene duration, motion (zoom in/out, pans, static), transitions (fade, dissolve, wipes, slides), burned-in subtitles, narration and music mixing, watermark, 9:16 / 16:9 / 1:1 / 4:5, H.264 MP4 export, plus thumbnail extraction. Rendering runs in a background job with live progress; output is served with HTTP range support so iPhone Safari can scrub it.

### 6. Voiceover and Audio Studio
- **AI narration (your key):** OpenAI-compatible text-to-speech, per scene or whole script.
- **No-key audio:** procedural ambient music beds generated with ffmpeg, plus upload of your own narration or music files.

### 7. YouTube and Social Publishing — needs Google OAuth
Official Google OAuth 2.0 + YouTube Data API v3. Titles, descriptions, tags, privacy and schedule are prepared as a **draft**; the upload only runs when you press approve, and the server rejects any upload request without explicit approval. Also generates platform-ready captions and hashtag packs for other networks.

### 8. Project and Content Library
Every project keeps its trends, ideas, scripts, scenes, assets, renders and publications together, with per-item deletion, activity history and export-ready media links.

---

## Honest feature status

Verified in this repository:

- `npm run build` — production build and type-check pass for all 31 routes.
- `npx tsx scripts/render-test.ts` — 11/11 checks: posters rendered, music bed generated, 9:16 H.264 1080×1920 MP4 with AAC audio and burned subtitles, thumbnail extracted, 16:9 1920×1080 render. Validated with `ffprobe`.
- Dependency security scan — 0 known high/critical advisories across 137 packages.
- Trend research sources are public endpoints and require no key.
- Publishing refuses to upload without the explicit approval flag.

Not verified here, because it needs credentials or hardware this environment does not have:

- **Real AI provider calls** (Perplexity, OpenAI, Anthropic, Gemini, OpenRouter) — the client code is implemented, but no user API key was available, so responses were not exercised against live endpoints.
- **Real YouTube upload** — OAuth flow, token refresh and resumable upload are implemented against the official API, but no Google Cloud client was configured, so no video was actually uploaded to a channel.
- **AI image generation and AI text-to-speech** — implemented, not exercised without a key.
- **iPhone Safari on a physical device** — layout is mobile-first with safe-area insets, but was not tested on real hardware.

Known limitations of the free-tier design:

- Uploading public videos via the YouTube Data API requires a Google Cloud project whose OAuth consent screen is configured; unverified projects can only upload private videos. This is a Google policy limit, not an app bug.
- `sql.js` stores data in a single file. On a host with ephemeral storage, that file is lost on redeploy — attach a persistent volume or swap in a hosted Postgres/SQLite service for durable production data.
- Rendering runs in-process with ffmpeg, so long videos occupy the server CPU while they render. Free single-vCPU instances will be slow for long-form content.
- AI image generation quality and availability depend entirely on the provider and model you supply; genuinely free image quotas are small and change often.

---

## Cost

$0 to run as designed: open-source runtime, local SQLite, local ffmpeg, no render or storage service. The only optional costs come from third-party AI providers you choose to add with your own keys — free tiers exist for OpenRouter and Gemini, and the app labels which catalog models are free.

## Security notes

- Passwords hashed with scrypt; sessions are signed HTTP-only cookies.
- Provider keys encrypted with AES-256-GCM and never returned in API responses.
- Every API route is scoped by the authenticated user id; media is served only through `/api/media/<assetId>` with an ownership check, never by filesystem path.
- Uploads are size-limited and extension-checked.
