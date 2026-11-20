import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

// Run payment integration tests in a disposable local database, never in the
// database containing development data. The external payment API is mocked.
const source = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
  throw new Error("Payment integration tests require a local PostgreSQL server.");
}
const databaseName = `azbuka_sbp_test_${randomUUID().replaceAll("-", "")}`;
const connection = new pg.Client({ connectionString: source.toString() });
await connection.connect();
let created = false;
try {
  await connection.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  source.pathname = `/${databaseName}`;
  const env = { ...process.env, DATABASE_URL: source.toString(), SBP_TEST_DATABASE_URL: source.toString() };
  await run(["exec", "prisma", "migrate", "deploy"], env);
  // Both suites assert absence of audit writes in this isolated database.
  await run(["exec", "vitest", "run", "--no-file-parallelism", "src/server/billing/billing-payments.integration.test.ts", "src/server/billing/branch-tariffs.integration.test.ts"], env);
} finally {
  if (created) await connection.query(`DROP DATABASE "${databaseName}"`);
  await connection.end();
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Payment test command failed (${code}).`)));
  });
}
