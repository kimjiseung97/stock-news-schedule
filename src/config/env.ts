import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export const env = {
  port: optionalNumber("PORT", 4000),
  databaseUrl: required("DATABASE_URL"),

  // dev/prod 서버가 같은 TB_STOCK_NEWS를 바라보므로, 개발 서버에서는 false로 내려 수집 배치가
  // 중복으로 돌지 않게 한다(형제 Kotlin 프로젝트의 SCHEDULER_ENABLED와 동일한 스위치).
  // false여도 express 서버는 그대로 뜨고, npm run news-collect:once 같은 수동 실행은 가능하다.
  schedulerEnabled: optionalBoolean("SCHEDULER_ENABLED", true),

  naverNews: {
    clientId: required("NAVER_NEWS_CLIENT_ID"),
    clientSecret: required("NAVER_NEWS_CLIENT_SECRET"),
    maxArticlesPerQuery: optionalNumber("NAVER_NEWS_MAX_ARTICLES_PER_QUERY", 1),
    cacheTtlMinutes: optionalNumber("NAVER_NEWS_CACHE_TTL_MINUTES", 60),
  },

  // node-cron 표현식은 Spring과 동일하게 "초 분 시 일 월 요일" 순서를 지원하므로 Kotlin 프로젝트의 cron 값을 그대로 옮길 수 있다.
  newsCollect: {
    cron: process.env.STOCK_NEWS_COLLECT_CRON ?? "0 0 6 * * *",
    // 네이버 뉴스검색 오픈API 앱 키를 stockNews(Kotlin)와 공유하며, 그쪽 news-collect thread-pool-size(8)로 안정 운영된 전례를 따른다.
    concurrency: optionalNumber("STOCK_NEWS_COLLECT_CONCURRENCY", 8),
    // 로컬/스테이징에서 운영 DB를 대상으로 소규모 테스트를 할 때만 쓰는 옵션 - 지정하면 ACTIVE 종목 중 앞에서 N개만 수집한다.
    limit: process.env.STOCK_NEWS_COLLECT_LIMIT ? Number(process.env.STOCK_NEWS_COLLECT_LIMIT) : undefined,
  },
  newsCleanup: {
    cron: process.env.STOCK_NEWS_CLEANUP_CRON ?? "0 30 6 * * *",
    retentionDays: optionalNumber("STOCK_NEWS_CLEANUP_RETENTION_DAYS", 7),
  },
};
