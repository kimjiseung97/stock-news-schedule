import cron from "node-cron";
import { env } from "../config/env";
import { runStockNewsCollectJob } from "../jobs/stockNewsCollectJob";
import { runStockNewsCleanupJob } from "../jobs/stockNewsCleanupJob";

const TIMEZONE = "Asia/Seoul";

export function registerSchedulers(): void {
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
