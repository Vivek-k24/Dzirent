// C2: starts or stops the local stub server (server.mjs) as the container "dzirent-stubs" on the
// local Supabase Docker network, so the local database's Vault addresses reach it by name.
//   node supabase/tests/stubs/run.mjs start   (idempotent; waits for /health)
//   node supabase/tests/stubs/run.mjs stop
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = "dzirent-stubs";
const IMAGE = "node:22-alpine";

function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

function network() {
  const nets = docker(["network", "ls", "--format", "{{.Name}}"]).split(/\r?\n/).filter((n) => n.startsWith("supabase_network_"));
  if (nets.length === 0) throw new Error("No local Supabase network: run supabase start first.");
  return nets[0];
}

function serviceRoleKey(repoRoot) {
  const cli = process.env.SUPABASE_CLI ?? "supabase";
  const out = execFileSync(cli, ["status", "-o", "env"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  return /^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m.exec(out)?.[1];
}

export async function startStubs() {
  const running = docker(["ps", "--filter", `name=^${NAME}$`, "--format", "{{.Names}}"]);
  if (!running) {
    try {
      docker(["rm", "-f", NAME]);
    } catch {}
    const key = serviceRoleKey(resolve(HERE, "..", "..", ".."));
    if (!key) throw new Error("Couldn't read the local service role key from supabase status.");
    docker([
      "run", "-d", "--rm", "--name", NAME, "--network", network(), "-p", "8787:8787",
      "-v", `${HERE}:/stubs:ro`,
      "-e", "SUPABASE_URL=http://kong:8000", "-e", `SERVICE_ROLE_KEY=${key}`,
      "-e", "PUSH_SECRET=local-push-secret", "-e", "SCAN_SECRET=local-scan-secret",
      IMAGE, "node", "/stubs/server.mjs",
    ]);
  }
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The stub server didn't answer on :8787");
}

export function stopStubs() {
  try {
    docker(["rm", "-f", NAME]);
  } catch {}
}

if (process.argv[1]?.endsWith("run.mjs")) {
  const cmd = process.argv[2];
  if (cmd === "start") startStubs().then(() => console.log(`${NAME} running on :8787`)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
  else if (cmd === "stop") {
    stopStubs();
    console.log(`${NAME} stopped`);
  } else {
    console.error("usage: node supabase/tests/stubs/run.mjs start|stop");
    process.exit(2);
  }
}
