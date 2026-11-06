/* Сборка релиза: dist/module.zip и dist/module.json.
   node scripts-dev/build.mjs [версия] — версия подставляется в манифест и ссылку на архив. */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/%20/g, " ");
const dist = join(root, "dist");
const stage = join(dist, "stage");

const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
const version = (process.argv[2] ?? manifest.version).replace(/^v/, "");
manifest.version = version;
manifest.download = manifest.download.replace(/\/download\/v[^/]+\//, `/download/v${version}/`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// В архив идёт только то, что нужно Foundry: без тестов, стендов и генератора звуков.
for (const item of ["scripts", "styles", "templates", "lang", "sounds", "fonts", "LICENSE", "README.md", "README.en.md", "CHANGELOG.md"]) {
  if (existsSync(join(root, item))) cpSync(join(root, item), join(stage, item), { recursive: true });
}
writeFileSync(join(stage, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(dist, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync("zip", ["-r", "-q", "-X", join(dist, "module.zip"), "."], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`✓ dist/module.zip и dist/module.json — версия ${version}`);
