import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createDemangler } from "../dist/node.js";

const root = new URL("../.build/llvm/llvm/test/Demangle/", import.meta.url);
const api = await createDemangler();
const kinds = new Set();
let cases = 0;
let damaged = 0;
for (const file of (await readdir(root)).filter(name => name.startsWith("ms-"))) {
  const lines = (await readFile(new URL(file, root), "utf8")).split(/\r?\n/);
  for (const name of lines.filter(line => /^[?.]/.test(line))) {
    const result = api.demangle(name);
    assert.notEqual(result.status, "error", `${file}: ${name}: ${result.warnings}`);
    for (const node of result.ast?.nodes ?? []) kinds.add(node.kind);
    cases++;
    // Every prefix exercises truncation at a different grammar boundary.
    for (let length = 1; length < name.length; ++length) {
      const truncated = api.demangle(name.slice(0, length));
      assert.notEqual(truncated.status, "error", `Truncated ${file}: ${name.slice(0, length)}`);
      damaged++;
    }
  }
}
assert(cases > 1000, "Upstream corpus unexpectedly small");
assert(kinds.size >= 24, `Unexpected node coverage: ${[...kinds]}`);
assert.equal(api.demangle("?x@@3HA").status, "success", "Instance must survive damaged names");
console.warn(`${cases} LLVM inputs, ${damaged} truncated inputs; ${kinds.size} node kinds.`);
