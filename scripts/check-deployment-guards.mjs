import { readFileSync } from "node:fs";

const configs = ["../vercel.json", "../apps/web/vercel.json"];
let failed = false;

for (const relative of configs) {
  const name = relative.slice(3);
  const config = JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
  if (config.git?.deploymentEnabled !== false) {
    console.error(`${name}: git.deploymentEnabled must be false. Use a deliberate, reviewed release; branch patterns can permit automatic deployment.`);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Deployment guards passed: automatic Git deployments are disabled in both Vercel configurations.");
}
