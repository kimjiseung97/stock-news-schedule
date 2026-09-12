import express from "express";
import { env } from "./config/env";
import { registerSchedulers } from "./scheduler";

const app = express();

// 배포 스크립트가 컨테이너 기동 확인용으로 호출한다(cron 등록 여부까지 같이 노출).
app.get("/health", (_req, res) => {
  res.json({ status: "ok", schedulerEnabled: env.schedulerEnabled });
});

registerSchedulers();

app.listen(env.port, () => {
  console.log(`[server] listening on port ${env.port}`);
});
