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

// 네이버 검색 오픈API 공식 제한은 초당 10건(일일 25,000건은 종목 수 대비 여유 있어 문제 안 됨).
// 초(정수) 단위 버킷에 카운터를 두고, 그 초에 10건이 이미 나갔으면 다음 초까지 대기한다.
// Node는 단일 프로세스·싱글 스레드 이벤트 루프라 이 카운터 접근에 레이스 컨디션이 없어 인메모리로 충분하다
// (여러 인스턴스로 수평 확장하게 되면 그때는 Redis 같은 공유 저장소로 옮겨야 한다).
const MAX_REQUESTS_PER_SECOND = 10;
let bucketSecond = 0;
let bucketCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reserveSlot(): Promise<void> {
  for (;;) {
    const currentSecond = Math.floor(Date.now() / 1000);
    if (currentSecond !== bucketSecond) {
      bucketSecond = currentSecond;
      bucketCount = 0;
    }
    if (bucketCount < MAX_REQUESTS_PER_SECOND) {
      bucketCount += 1;
      return;
    }
    const waitMs = (bucketSecond + 1) * 1000 - Date.now();
    await sleep(Math.max(waitMs, 10));
  }
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
  await reserveSlot();

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
      // 429가 "일일 할당량 초과"인지 "초당 요청 한도 초과"인지는 HTTP status만으론 구분이 안 되고
      // 응답 body의 errorCode/errorMessage로만 구분 가능하다(예: 할당량 초과는 errorCode "010").
      const errorBody: string = await res.text().catch(() => "");
      throw new Error(`naver news api status ${res.status}: ${errorBody}`);
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
