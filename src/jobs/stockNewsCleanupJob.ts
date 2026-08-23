import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { nowSeoulNaive } from "../lib/time";

// [배치] TB_STOCK_NEWS의 보관 기간(기본 7일)을 지난 기사를 주기적으로 삭제한다.
export async function runStockNewsCleanupJob(): Promise<void> {
  // collectedAt이 KST 벽시계 literal로 저장되므로(../lib/time.ts 참고), 기준선도 동일하게 KST 벽시계 기준으로 계산한다.
  const threshold: Date = new Date(nowSeoulNaive().getTime() - env.newsCleanup.retentionDays * 24 * 60 * 60 * 1000);
  // COLLECTED_AT이 기준선보다 오래된(threshold보다 작은) 행을 전부 삭제
  const result: Prisma.BatchPayload = await prisma.stockNews.deleteMany({
    where: { collectedAt: { lt: threshold } },
  });
  console.log(`[stockNewsCleanup] done: deleted=${result.count}, retentionDays=${env.newsCleanup.retentionDays}`);
}
