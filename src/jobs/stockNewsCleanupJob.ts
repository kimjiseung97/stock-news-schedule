import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

// [배치] TB_STOCK_NEWS의 보관 기간(기본 7일)을 지난 기사를 주기적으로 삭제한다.
export async function runStockNewsCleanupJob(): Promise<void> {
  const threshold: Date = new Date(Date.now() - env.newsCleanup.retentionDays * 24 * 60 * 60 * 1000);
  const result: Prisma.BatchPayload = await prisma.stockNews.deleteMany({
    where: { collectedAt: { lt: threshold } },
  });
  console.log(`[stockNewsCleanup] done: deleted=${result.count}, retentionDays=${env.newsCleanup.retentionDays}`);
}
