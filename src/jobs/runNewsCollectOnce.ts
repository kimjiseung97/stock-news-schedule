import { runStockNewsCollectJob } from "./stockNewsCollectJob";
import { prisma } from "../lib/prisma";

runStockNewsCollectJob()
  .catch((err) => {
    console.error("[stockNewsCollect] job crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
