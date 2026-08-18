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
