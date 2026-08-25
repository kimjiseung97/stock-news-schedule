import { type Stock, type Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import pLimit from 'p-limit';
import { fetchNaverNews, type NewsArticle } from "../services/naverNewsClient";
import { env } from "../config/env";
import { nowSeoulNaive } from "../lib/time";

// [배치] ACTIVE 종목 전체를 대상으로 네이버에서 뉴스를 조회해 TB_STOCK_NEWS에 적재한다.
// 같은 기사가 재수집되는 것을 막기 위해 (STOCK_ID, URL) 기준으로 이미 있는 기사는 건너뛴다.
// Kotlin의 멀티스레드 청크 스텝(스레드풀 병렬 처리)과 동일한 동시성 모델을, 종목 큐를 여러 워커가 소비하는 방식으로 재현한다.
// 보관 정책은 stockNewsCleanupJob이 별도로 처리한다.
export async function runStockNewsCollectJob(): Promise<void> {
  // ACTIVE 종목만 대상으로 조회. env.newsCollect.limit이 있으면 상위 N개만(로컬/스테이징 스모크 테스트용).
  const stocks: Stock[] = await prisma.stock.findMany({
    where: { status: "ACTIVE" },
    ...(env.newsCollect.limit ? { take: env.newsCollect.limit } : {}),
  });
  console.log(`[stockNewsCollect] target stocks: ${stocks.length}`);

  // 실제 네이버 검색에 쓰이는 텍스트(한글명, 없으면 영문명)가 같은 종목끼리 묶어서 조회를 한 번만 한다.
  // CIK로 묶으면 안 되는 이유: 같은 CIK(발행사)라도 ETN처럼 기초자산이 전혀 다른 여러 상품이 걸려있을 수 있다
  // (예: Bank of Montreal 발행 ETN 27종 - AI/금/원유/항공 등 서로 무관한 상품인데 CIK만 같음).
  // 반면 모건스탠리 보통주/우선주처럼 검색어 텍스트 자체가 우연히 같은 경우는 그룹핑해도 안전하다.
  const groups = new Map<string, Stock[]>();
  for (const stock of stocks) {
    const key = stock.koreanName ?? stock.name;
    const group = groups.get(key);
    if (group) {
      group.push(stock);
    } else {
      groups.set(key, [stock]);
    }
  }
  console.log(`[stockNewsCollect] query groups: ${groups.size}`);
  const limit = pLimit(env.newsCollect.concurrency);

  // 검색어 그룹별로 하나의 작업(task)을 만들고, pLimit이 env.newsCollect.concurrency개까지만 동시 실행되도록 큐잉한다.
  const tasks = [...groups.values()].map(group => limit(async () => {
    // 그룹 내 대표 종목(첫 번째) 이름으로 한 번만 조회하고, 결과를 그룹 내 모든 종목에 재사용한다.
    const representative = group[0];
    try {
      // 한글명이 있으면 한글명, 없으면 영문명으로 네이버 뉴스 검색 (naverNewsClient 내부에서 TTL 캐시됨)
      const articles: NewsArticle[] = await fetchNaverNews(representative.koreanName ?? representative.name);
      if (articles.length === 0) {
        return;
      }

      for (const stock of group) {
        try {
          // 이번에 조회된 URL들 중 이미 TB_STOCK_NEWS에 저장된 것을 조회해서 중복 삽입을 걸러낸다.
          const existing: { url: string }[] = await prisma.stockNews.findMany({
            where: { stockId: stock.id, url: { in: articles.map(a => a.url) } },
            select: { url: true },
          })
          const existingUrls = new Set(existing.map(r => r.url))
          const newArticles = articles.filter(a => !existingUrls.has(a.url));
          if (newArticles.length === 0) {
            continue;
          }
          // collectedAt은 DB 네이티브 default(UTC)에 맡기지 않고 KST 벽시계 값을 명시적으로 넣는다(../lib/time.ts 참고).
          const data: Prisma.StockNewsCreateManyInput[] = newArticles.map(a => ({
            stockId: stock.id,
            title: a.title,
            content: a.description ?? null,
            url: a.url,
            collectedAt: nowSeoulNaive(),
          }))
          // skipDuplicates: (stockId, url) 유니크 제약과 겹치는 행이 있어도 에러 없이 건너뛰고 나머지를 삽입.
          await prisma.stockNews.createMany({
            data,
            skipDuplicates: true,
          })
        } catch (err) {
          // 종목 하나가 실패해도 그룹 내 나머지 종목 처리는 계속 진행(전체 배치를 막지 않음).
          console.error(`${stock.ticker} 실패:`, err);
        }
      }
    } catch (err) {
      console.error(`${representative.ticker} 그룹(${group.map(s => s.ticker).join(",")}) 조회 실패:`, err);
    }
  }));

  await Promise.allSettled(tasks);
}
