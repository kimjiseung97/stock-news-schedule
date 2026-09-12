import { env } from "../config/env";
import { stripHtml, stripHtmlOrUndefined } from "../lib/htmlText";

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

interface CacheEntry {
  articles: NewsArticle[];
  fetchedAt: number;
}

// 검색어별 조회 결과를 TTL 동안 전역 캐시해서, 같은 종목을 여러 워커가 동시에 처리할 때 API 호출을 한 번으로 줄인다(Kotlin NaverNewsClient와 동일 전략).
const cache = new Map<string, CacheEntry>();

// 네이버 검색 오픈API 공식 제한은 초당 10건(일일 25,000건은 종목 수 대비 여유 있어 문제 안 됨).
// 실제 한도(9)보다 1건 낮게 잡아 클락/네트워크 지연에 대한 안전마진을 둔다.
//
// 벽시계 "정수초" 단위로 카운터를 리셋하는 고정 윈도우 방식은 초 경계에서 버스트가 생긴다
// (예: 우리 기준 0.85~0.99초에 10건 + 곧바로 다음 초 0.00~0.15초에 또 10건 = 실제로는
// 300ms 안에 20건이 나가는데도 "각 초당 10건 이하"로 착각). 실제로 이 방식으로 운영하면서도
// 429가 꾸준히(20~30초에 1번꼴) 새는 게 관측되어, 최근 N건의 요청 타임스탬프를 들고 있다가
// "가장 오래된(N번째 전) 요청이 지금으로부터 1초 이상 지났는지"로 판단하는 슬라이딩 윈도우로 바꿨다.
// 이러면 초 경계라는 개념 자체가 없어져서 임의의 1초 구간을 놓고 봐도 항상 MAX_REQUESTS_PER_SECOND 이하다.
// Node는 단일 프로세스·싱글 스레드 이벤트 루프라 이 큐 접근에 레이스 컨디션이 없어 인메모리로 충분하다
// (여러 인스턴스로 수평 확장하게 되면 그때는 Redis 같은 공유 저장소로 옮겨야 한다).
const MAX_REQUESTS_PER_SECOND = 9;
const WINDOW_MS = 1000;
const requestTimestamps: number[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reserveSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    // 윈도우(최근 1초)를 벗어난 오래된 타임스탬프는 큐 앞에서 제거.
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= WINDOW_MS) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length < MAX_REQUESTS_PER_SECOND) {
      requestTimestamps.push(now);
      return;
    }
    // 큐가 꽉 찼으면, 가장 오래된 요청이 윈도우를 벗어날 때까지만 대기했다가 다시 판단.
    const waitMs = WINDOW_MS - (now - requestTimestamps[0]);
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

// 일일 할당량 초과(errorCode "010")는 재시도해도 어차피 실패하므로 재시도하지 않는다.
// 초당 요청 한도 초과(errorCode "012")는 우리 쪽 슬라이딩 윈도우가 새는 순간(클락/네트워크 지연 등)에만
// 드물게 나는 일시적 오류라, 다음 윈도우가 열릴 시간만큼 대기했다가 딱 1번만 재시도한다.
const RATE_LIMIT_ERROR_CODE = "012";
const RATE_LIMIT_RETRY_WAIT_MS = 1100;

async function fetchFromApi(query: string, isRetry = false): Promise<NewsArticle[]> {
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
      if (res.status === 429 && !isRetry) {
        const errorCode: string | undefined = safeParseErrorCode(errorBody);
        if (errorCode === RATE_LIMIT_ERROR_CODE) {
          console.warn(`[naverNewsClient] rate limited for query="${query}", retrying in ${RATE_LIMIT_RETRY_WAIT_MS}ms:`, errorBody);
          await sleep(RATE_LIMIT_RETRY_WAIT_MS);
          return fetchFromApi(query, true);
        }
      }
      throw new Error(`naver news api status ${res.status}: ${errorBody}`);
    }

    const body: NaverNewsSearchResponse = (await res.json()) as NaverNewsSearchResponse;
    const articles: NewsArticle[] = [];
    for (const item of body.items ?? []) {
      if (!item.link) continue;
      // 네이버 뉴스 검색 응답의 title/description에는 검색어 하이라이트용 <b> 태그와 HTML 엔티티가
      // 섞여 오므로 저장 전에 제거한다(형제 Kotlin 프로젝트의 HtmlTextUtils와 동일 규칙).
      articles.push({
        title: stripHtml(item.title ?? ""),
        url: item.link,
        description: stripHtmlOrUndefined(item.description),
      });
    }
    return articles;
  } catch (err) {
    console.warn(`[naverNewsClient] fetchNews failed for query="${query}":`, err);
    return [];
  }
}

function safeParseErrorCode(errorBody: string): string | undefined {
  try {
    return (JSON.parse(errorBody) as { errorCode?: string }).errorCode;
  } catch {
    return undefined;
  }
}
