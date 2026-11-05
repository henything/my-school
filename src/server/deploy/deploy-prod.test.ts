import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function deploy(failBuild: boolean, reconnect = false) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-regression-"));
  const trace = join(dir, "trace");
  writeFileSync(trace, "");
  const ssh = `#!/bin/bash
case "$*" in
  *"-O check"*) if [ "$RECONNECT" = 1 ]; then exit 1; else exit 0; fi ;;
  *"-O exit"*|*"-MNf"*) exit 0 ;;
  *"true")
    case " $* " in *" -n "*) ;; *) /bin/cat >/dev/null ;; esac
    exit 0 ;;
  *"bash -s"*)
    payload=$(/bin/cat)
    case "$payload" in
      *"pnpm install"*)
        printf 'build\\n' >> "$DEPLOY_TRACE"
        case "$payload" in *"env CI=true"*) ;; *) exit 41 ;; esac
        if [ "$FAIL_BUILD" = 1 ]; then exit 42; fi ;;
      *"pg_dump"*) printf 'backup\\n' >> "$DEPLOY_TRACE" ;;
      *"prisma migrate deploy"*) printf 'migrate\\n' >> "$DEPLOY_TRACE" ;;
    esac ;;
esac
exit 0
`;
  for (const [name, body] of Object.entries({ ssh, rsync: "#!/bin/bash\nexit 0\n", curl: "#!/bin/bash\nprintf 200\n" })) {
    writeFileSync(join(dir, name), body, { mode: 0o755 });
  }
  try {
    const result = spawnSync("/bin/bash", [resolve("scripts/deploy-prod.sh"), "--skip-git-check", "--skip-precheck", "--host", "fake-host"], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DEPLOY_TRACE: trace, FAIL_BUILD: failBuild ? "1" : "0", RECONNECT: reconnect ? "1" : "0", AZBUKA_SSH_SLEEP_SECONDS: "0" },
      encoding: "utf8", timeout: 10000
    });
    return { ...result, trace: readFileSync(trace, "utf8").trim().split("\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("production deploy failure handling", () => {
  it("stops after a remote build failure without retrying an empty stdin script", () => {
    const result = deploy(true);
    expect(result.status).toBe(42);
    expect(result.trace).toEqual(["build"]);
    expect(result.stdout).not.toContain("Deploy complete");
  });

  it("installs without interactive prompts and backs up before migration", () => {
    const result = deploy(false);
    expect(result.status).toBe(0);
    expect(result.trace).toEqual(["build", "backup", "migrate"]);
    expect(result.stdout).toContain("Deploy complete");
  });

  it("preserves script stdin when the control connection must be reopened", () => {
    const result = deploy(false, true);
    expect(result.status).toBe(0);
    expect(result.trace).toEqual(["build", "backup", "migrate"]);
  });
});
