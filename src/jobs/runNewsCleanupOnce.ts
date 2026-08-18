import { runStockNewsCleanupJob } from "./stockNewsCleanupJob";
import { prisma } from "../lib/prisma";

runStockNewsCleanupJob()
  .catch((err) => {
    console.error("[stockNewsCleanup] job crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
