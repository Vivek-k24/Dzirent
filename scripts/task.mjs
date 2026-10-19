import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localUv = join(root, ".tools", "bootstrap", process.platform === "win32" ? "Scripts/uv.exe" : "bin/uv");
const uv = existsSync(localUv) ? localUv : "uv";
const python = readFileSync(join(root, ".python-version"), "utf8").trim();
const pnpmCli = process.env.npm_execpath;

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, PYTHONUTF8: "1", ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

function pnpm(args, env = {}) {
  if (!pnpmCli?.endsWith(".cjs") && !pnpmCli?.endsWith(".js")) {
    throw new Error("Run this task through pnpm so its pinned CLI is available");
  }
  run(process.execPath, [pnpmCli, ...args], env);
}

function api(args, env = {}) {
  run(uv, ["run", "--directory", "services/api", "--frozen", "--python", python, ...args], env);
}

const [task, mode = "demo", port] = process.argv.slice(2);
switch (task) {
  case "web":
    if (!["demo", "connected"].includes(mode)) throw new Error("Unknown mode");
    pnpm(["--filter", "@dzirent/web", "dev", "--port", port ?? "3000"], { NEXT_PUBLIC_DZIRENT_MODE: mode });
    break;
  case "api":
    if (!["demo", "connected"].includes(mode)) throw new Error("Unknown mode");
    api(["uvicorn", "dzirent_api.main:app", "--host", "127.0.0.1", "--port", port ?? "8000"], {
      DZIRENT_MODE: mode,
      DZIRENT_IDENTITY_MODE: mode === "demo" ? "mock" : "clerk",
    });
    break;
  case "api-sync":
    run(uv, ["sync", "--directory", "services/api", "--frozen", "--python", python]);
    break;
  case "contracts-generate":
    api(["python", "-m", "dzirent_api.export_contract"]);
    pnpm(["exec", "openapi-typescript", "contracts/openapi.json", "-o", "packages/client/src/generated/api.ts"]);
    break;
  case "contracts-check": {
    api(["python", "-m", "dzirent_api.export_contract", "--check"]);
    const temp = mkdtempSync(join(tmpdir(), "dzirent-contract-"));
    try {
      const generated = join(temp, "api.ts");
      pnpm(["exec", "openapi-typescript", "contracts/openapi.json", "-o", generated]);
      const committed = join(root, "packages/client/src/generated/api.ts");
      const normalize = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
      if (normalize(generated) !== normalize(committed)) throw new Error("Generated TypeScript drift");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    break;
  }
  case "fixtures-check":
    api(["python", "../../scripts/validate_foundation.py"]);
    break;
  case "check":
    pnpm(["lint"]);
    pnpm(["typecheck"]);
    pnpm(["media:check"]);
    api(["ruff", "check", ".", "../../fixtures/catalog/generate.py", "../../scripts/validate_foundation.py"]);
    api(["ruff", "format", "--check", ".", "../../fixtures/catalog/generate.py", "../../scripts/validate_foundation.py"]);
    api(["mypy"]);
    pnpm(["contracts:check"]);
    pnpm(["fixtures:check"]);
    break;
  default:
    throw new Error(`Unknown task: ${task}`);
}
