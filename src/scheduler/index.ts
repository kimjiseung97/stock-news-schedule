import cron from "node-cron";
import { env } from "../config/env";
import { runStockNewsCollectJob } from "../jobs/stockNewsCollectJob";
import { runStockNewsCleanupJob } from "../jobs/stockNewsCleanupJob";

const TIMEZONE = "Asia/Seoul";

export function registerSchedulers(): void {
  // 개발 서버(SCHEDULER_ENABLED=false)는 상용과 같은 TB_STOCK_NEWS를 보므로 cron을 아예 등록하지 않는다.
  // express 서버는 그대로 뜨고, npm run news-collect:once 같은 수동 1회 실행은 여전히 가능하다.
  if (!env.schedulerEnabled) {
    console.log("[scheduler] SCHEDULER_ENABLED=false - cron 등록을 건너뜁니다(수동 1회 실행은 가능).");
    return;
  }

  let collecting: boolean = false;

  cron.schedule(
    env.newsCollect.cron,
    async (): Promise<void> => {
      if (collecting) {
        console.log("[stockNewsCollect] already running, skipping this trigger");
        return;
      }
      collecting = true;
      try {
        await runStockNewsCollectJob();
      } catch (err) {
        console.error("[stockNewsCollect] job failed:", err);
      } finally {
        collecting = false;
      }
    },
    { timezone: TIMEZONE },
  );

  cron.schedule(
    env.newsCleanup.cron,
    (): void => {
      runStockNewsCleanupJob().catch((err: unknown) => console.error("[stockNewsCleanup] job failed:", err));
    },
    { timezone: TIMEZONE },
  );

  console.log(
    `[scheduler] registered: news-collect(${env.newsCollect.cron}), news-cleanup(${env.newsCleanup.cron})`,
  );
}
