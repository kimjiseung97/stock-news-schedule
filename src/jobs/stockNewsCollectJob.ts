import { type Stock, type Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import pLimit from 'p-limit';
import { fetchNaverNews, type NewsArticle } from "../services/naverNewsClient";
import { env } from "../config/env";

// [배치] ACTIVE 종목 전체를 대상으로 네이버에서 뉴스를 조회해 TB_STOCK_NEWS에 적재한다.
// 같은 기사가 재수집되는 것을 막기 위해 (STOCK_ID, URL) 기준으로 이미 있는 기사는 건너뛴다.
// Kotlin의 멀티스레드 청크 스텝(스레드풀 병렬 처리)과 동일한 동시성 모델을, 종목 큐를 여러 워커가 소비하는 방식으로 재현한다.
// 보관 정책은 stockNewsCleanupJob이 별도로 처리한다.
export async function runStockNewsCollectJob(): Promise<void> {
  const stocks: Stock[] = await prisma.stock.findMany({
    where: { status: "ACTIVE" },
    ...(env.newsCollect.limit ? { take: env.newsCollect.limit } : {}),
  });
  console.log(`[stockNewsCollect] target stocks: ${stocks.length}`);
  // 동시에 50개 요청만 허용
  const limit = pLimit(50);

  const tasks = stocks.map(stock => limit(async () => {
    try {
      const articles: NewsArticle[] = await fetchNaverNews(stock.koreanName ?? stock.name);
      if (articles.length === 0) {
        return;
      }
      const existing: { url: string }[] = await prisma.stockNews.findMany({
        where: { stockId: stock.id, url: { in: articles.map(a => a.url) } },
        select: { url: true },
      })
      const existingUrls = new Set(existing.map(r => r.url))
      const newArticles = articles.filter(a => !existingUrls.has(a.url));
      if (newArticles.length === 0) {
        return;
      }
      const data: Prisma.StockNewsCreateManyInput[] = newArticles.map(a => ({
        stockId: stock.id,
        title: a.title,
        content: a.description ?? null,
        url: a.url,
      }))
      const result: Prisma.BatchPayload = await prisma.stockNews.createMany({
        data,
        skipDuplicates: true,
      })
    } catch (err) {
      console.error(`${stock.ticker} 실패:`, err);
    }
    await Promise.allSettled(tasks);
  }));
}
