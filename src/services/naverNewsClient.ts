import { env } from "../config/env";

export interface NewsArticle {
  title: string;
  url: string;
  description?: string;
}

interface NaverNewsItem {
  title?: string;
  link?: string;
  description?: string;
}

interface NaverNewsSearchResponse {
  items?: NaverNewsItem[];
}

const HTML_TAG_REGEX = /<.*?>/g;

function unescapeHtml(text: string): string {
  return text
    .replace(HTML_TAG_REGEX, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

interface CacheEntry {
  articles: NewsArticle[];
  fetchedAt: number;
}

// 검색어별 조회 결과를 TTL 동안 전역 캐시해서, 같은 종목을 여러 워커가 동시에 처리할 때 API 호출을 한 번으로 줄인다(Kotlin NaverNewsClient와 동일 전략).
const cache = new Map<string, CacheEntry>();

// 네이버 오픈API는 동시 요청 수보다 초당 호출 빈도에 민감하게 429를 반환한다.
// 다만 전역으로 요청 하나만 순차 처리하면(레인 1개) concurrency(pLimit) 설정과 무관하게
// 처리량이 초당 5건으로 고정돼버려서, 종목 수가 많을 때(1만+) 체감상 너무 느려진다.
// pLimit의 concurrency만큼 "레인"을 두고 라운드로빈으로 분배해, 레인별로는 200ms 간격을 지키면서
// 전체적으로는 concurrency배만큼 병렬 처리되도록 한다(레인 8개 기준 실질 초당 40건).
const MIN_REQUEST_INTERVAL_MS = 200; // 레인 하나당 최대 초당 5건
const LANE_COUNT = env.newsCollect.concurrency;
const laneNextSlotAt: number[] = new Array(LANE_COUNT).fill(0);
let laneCursor = 0;

function reserveSlot(): number {
  const lane = laneCursor % LANE_COUNT;
  laneCursor += 1;
  const now = Date.now();
  const start = Math.max(now, laneNextSlotAt[lane]);
  laneNextSlotAt[lane] = start + MIN_REQUEST_INTERVAL_MS;
  return start;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchNaverNews(query: string): Promise<NewsArticle[]> {
  const cached: CacheEntry | undefined = cache.get(query);
  const ttlMs: number = env.naverNews.cacheTtlMinutes * 60_000;
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.articles;
  }

  const articles: NewsArticle[] = await fetchFromApi(query);
  cache.set(query, { articles, fetchedAt: Date.now() });
  return articles;
}

async function fetchFromApi(query: string): Promise<NewsArticle[]> {
  const slotAt = reserveSlot();
  const wait = slotAt - Date.now();
  if (wait > 0) {
    await sleep(wait);
  }

  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(env.naverNews.maxArticlesPerQuery));
  url.searchParams.set("sort", "sim");

  try {
    const res: Response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": env.naverNews.clientId,
        "X-Naver-Client-Secret": env.naverNews.clientSecret,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`naver news api status ${res.status}`);
    }

    const body: NaverNewsSearchResponse = (await res.json()) as NaverNewsSearchResponse;
    const articles: NewsArticle[] = [];
    for (const item of body.items ?? []) {
      if (!item.link) continue;
      articles.push({
        title: unescapeHtml(item.title ?? ""),
        url: item.link,
        description: item.description ? unescapeHtml(item.description) : undefined,
      });
    }
    return articles;
  } catch (err) {
    console.warn(`[naverNewsClient] fetchNews failed for query="${query}":`, err);
    return [];
  }
}
