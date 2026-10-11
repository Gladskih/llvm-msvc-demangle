import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json"));
const pack = JSON.parse(await readFile("pack-result.json"))[0];
const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/${packageJson.version}`);
if (response.status === 404) {
  await appendFile(process.env.GITHUB_OUTPUT, "exists=false\n");
} else {
  assert(response.ok, `Registry unavailable: HTTP ${response.status}`);
  assert.equal((await response.json()).dist.integrity, pack.integrity,
    "An immutable npm version already exists with different contents");
  await appendFile(process.env.GITHUB_OUTPUT, "exists=true\n");
}
