import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Use a local PostgreSQL instance only.");
const name = `azbuka_correction_qa_${randomBytes(5).toString("hex")}`;
const adminUrl = new URL(url); adminUrl.pathname = "/postgres"; adminUrl.search = "";
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  const migrate = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
  if (migrate.status) throw new Error(migrate.stderr + migrate.stdout);
  const test = spawnSync(process.execPath, ["--import", "tsx", "tests/integration/manual-corrections.ts"], { env, encoding: "utf8" });
  process.stdout.write(test.stdout); process.stderr.write(test.stderr);
  if (test.status) throw new Error("Integration scenario failed");
  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/manual-correction-qa.env", `DATABASE_URL=${url.toString()}\n`, { mode: 0o600 });
  console.log(`Isolated QA database retained: ${name}. Local environment file: .local/manual-correction-qa.env`);
} finally { await admin.end(); }
