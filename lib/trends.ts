import { chatJson, hasProvider, chat } from './providers';

/* ------------------------------------------------------------------------- */
/* TREND RESEARCH                                                            */
/* Free sources that need no API key: Hacker News, Google News RSS, Reddit    */
/* public JSON, Wikimedia pageviews. YouTube trending is optional (needs the  */
/* user's own YouTube Data API key).                                         */
/* ------------------------------------------------------------------------- */

export type TrendItem = {
  source: string;
  title: string;
  url: string;
  score: number;
  summary?: string;
  publishedAt?: string;
};

const UA = 'TJ-AI-Content-Factory/1.0 (+content research; contact: app owner)';

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: '*/*' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseRss(xml: string, source: string, limit: number): TrendItem[] {
  const items: TrendItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const block of blocks.slice(0, limit)) {
    const title = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decodeEntities((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const pub = decodeEntities((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
    const description = decodeEntities((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '');
    if (!title) continue;
    items.push({
      source,
      title,
      url: link,
      score: Math.max(1, limit - items.length),
      summary: description.slice(0, 240) || undefined,
      publishedAt: pub || undefined,
    });
  }
  return items;
}

export async function fetchHackerNews(limit = 10): Promise<TrendItem[]> {
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
  const slice = ids.slice(0, Math.min(limit, 12));
  const stories = await Promise.all(
    slice.map(async (id) => {
      try {
        return await fetchJson<{ title: string; url?: string; score?: number; id: number; time?: number }>(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        );
      } catch {
        return null;
      }
    }),
  );
  return stories
    .filter((story): story is NonNullable<typeof story> => !!story?.title)
    .map((story) => ({
      source: 'Hacker News',
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      score: story.score || 1,
      publishedAt: story.time ? new Date(story.time * 1000).toISOString() : undefined,
    }))
    .sort((a, b) => b.score - a.score);
}

export async function fetchGoogleNews(topic: string, limit = 10): Promise<TrendItem[]> {
  const query = encodeURIComponent(topic || 'technology');
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${query}+when:7d&hl=en-US&gl=US&ceid=US:en`,
  );
  return parseRss(xml, 'Google News', limit);
}

export async function fetchReddit(topic: string, limit = 10): Promise<TrendItem[]> {
  const sub = /^[a-z0-9_]{2,21}$/i.test(topic.trim()) ? topic.trim() : 'technology';
  const payload = await fetchJson<{
    data?: { children?: Array<{ data: { title: string; permalink: string; score: number; selftext?: string; subreddit: string; created_utc: number } }> };
  }>(`https://www.reddit.com/r/${sub}/hot.json?limit=${Math.min(limit, 25)}&raw_json=1`);
  const children = payload?.data?.children || [];
  return children.slice(0, limit).map((child) => ({
    source: `r/${child.data.subreddit}`,
    title: child.data.title,
    url: `https://www.reddit.com${child.data.permalink}`,
    score: child.data.score || 1,
    summary: (child.data.selftext || '').slice(0, 240) || undefined,
    publishedAt: child.data.created_utc ? new Date(child.data.created_utc * 1000).toISOString() : undefined,
  }));
}

export async function fetchWikipediaTop(limit = 10): Promise<TrendItem[]> {
  const day = new Date(Date.now() - 2 * 86400000);
  const year = day.getUTCFullYear();
  const month = String(day.getUTCMonth() + 1).padStart(2, '0');
  const date = String(day.getUTCDate()).padStart(2, '0');
  const payload = await fetchJson<{
    items?: Array<{ articles?: Array<{ article: string; views: number; rank: number }> }>;
  }>(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${date}`);
  const articles = payload?.items?.[0]?.articles || [];
  return articles
    .filter((article) => article.article !== 'Main_Page' && !article.article.startsWith('Special:'))
    .slice(0, limit)
    .map((article) => ({
      source: 'Wikipedia trending',
      title: decodeURIComponent(article.article).replace(/_/g, ' '),
      url: `https://en.wikipedia.org/wiki/${article.article}`,
      score: article.views,
    }));
}

export async function fetchYouTubeTrending(
  apiKey: string | null,
  regionCode = 'US',
  limit = 10,
): Promise<TrendItem[]> {
  if (!apiKey) throw new Error('YouTube trending needs a YouTube Data API key in Settings.');
  const payload = await fetchJson<{
    items?: Array<{ snippet: { title: string; channelTitle: string; description?: string; publishedAt?: string }; id: string }>;
  }>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=${Math.min(
      limit,
      25,
    )}&regionCode=${regionCode}&key=${encodeURIComponent(apiKey)}`,
  );
  return (payload.items || []).map((item) => ({
    source: `YouTube · ${item.snippet.channelTitle}`,
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    score: 50,
    summary: (item.snippet.description || '').slice(0, 200) || undefined,
    publishedAt: item.snippet.publishedAt,
  }));
}

export type ResearchRequest = {
  userId: string;
  topic: string;
  subreddit: string;
  region: string;
  includeYouTube: boolean;
  youtubeKey: string | null;
};

export type ResearchResult = {
  items: TrendItem[];
  sources: Array<{ name: string; ok: boolean; count: number; error?: string }>;
  aiAnalysis: { trends: Array<{ trend: string; why: string; angle: string; keywords: string[]; momentum: string }>; note?: string } | null;
  aiProvider: string | null;
};

export async function researchTrends(request: ResearchRequest): Promise<ResearchResult> {
  const tasks: Array<{ name: string; run: () => Promise<TrendItem[]> }> = [
    { name: 'Hacker News', run: () => fetchHackerNews(10) },
    { name: 'Google News', run: () => fetchGoogleNews(request.topic, 10) },
    { name: 'Reddit', run: () => fetchReddit(request.subreddit || 'technology', 10) },
    { name: 'Wikipedia trending', run: () => fetchWikipediaTop(8) },
  ];
  if (request.includeYouTube) {
    tasks.push({
      name: 'YouTube trending',
      run: () => fetchYouTubeTrending(request.youtubeKey, request.region || 'US', 10),
    });
  }

  const settled = await Promise.all(
    tasks.map(async (task) => {
      try {
        const items = await task.run();
        return { name: task.name, ok: true, count: items.length, items };
      } catch (error: any) {
        return { name: task.name, ok: false, count: 0, items: [] as TrendItem[], error: error?.message || 'failed' };
      }
    }),
  );

  const items = settled.flatMap((entry) => entry.items);
  const sources = settled.map(({ name, ok, count, error }) => ({ name, ok, count, error }));

  let aiAnalysis: ResearchResult['aiAnalysis'] = null;
  let aiProvider: string | null = null;
  if (items.length && (await hasProvider(request.userId))) {
    try {
      const headlineList = items
        .slice(0, 28)
        .map((item, index) => `${index + 1}. [${item.source}] ${item.title}`)
        .join('\n');
      const { data, provider } = await chatJson<{
        trends: Array<{ trend: string; why: string; angle: string; keywords: string[]; momentum: string }>;
        note?: string;
      }>(request.userId, {
        system:
          'You are a trend analyst for short-form and long-form video creators. Group headlines into 4-6 distinct trends. Reply with JSON only: {"trends":[{"trend":"","why":"","angle":"","keywords":[""],"momentum":"rising|steady|peaking"}],"note":""}.',
        user: `Niche/topic: ${request.topic || 'general technology'}\nRegion: ${request.region}\nHeadlines:\n${headlineList}`,
        temperature: 0.4,
        maxTokens: 1200,
      });
      aiAnalysis = data;
      aiProvider = provider;
    } catch (error) {
      console.warn('[trends] AI analysis unavailable', error);
    }
  }

  return { items, sources, aiAnalysis, aiProvider };
}

/** Local, no-key clustering used when no AI provider is configured. */
export function heuristicTrends(items: TrendItem[], limit = 6) {
  const stop = new Set(
    'the a an and or for to of in on with how why what is are new this that from your you it its at by as be can will'.split(' '),
  );
  const counts = new Map<string, { label: string; weight: number; titles: string[] }>();
  for (const item of items) {
    const words = item.title.toLowerCase().match(/[a-z][a-z0-9+.-]{2,}/g) || [];
    for (const word of words) {
      if (stop.has(word)) continue;
      const entry = counts.get(word) || { label: word, weight: 0, titles: [] };
      entry.weight += 1 + Math.log10(Math.max(1, item.score));
      if (entry.titles.length < 3) entry.titles.push(item.title);
      counts.set(word, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => ({
      trend: entry.label,
      why: `Appears across ${entry.titles.length} trending stories.`,
      angle: `Make a video explaining ${entry.label} with a practical takeaway.`,
      keywords: [entry.label],
      momentum: 'steady',
    }));
}

export async function topicBrief(userId: string, topic: string): Promise<string> {
  if (!(await hasProvider(userId))) return '';
  try {
    const text = await chat(userId, {
      system: 'Summarise the following trend landscape in 4 short bullets for a video creator.',
      user: topic,
      temperature: 0.4,
      maxTokens: 400,
    });
    return text.trim();
  } catch {
    return '';
  }
}
