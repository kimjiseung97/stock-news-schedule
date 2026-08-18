import express from "express";
import { env } from "./config/env";
import { registerSchedulers } from "./scheduler";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

registerSchedulers();

app.listen(env.port, () => {
  console.log(`[server] listening on port ${env.port}`);
});
