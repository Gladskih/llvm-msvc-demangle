import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDemangler } from "../dist/node.js";

const names = JSON.parse(await readFile(".build/upstream-names.json"));
const expected = (await readFile(".build/oracle-results.txt", "utf8")).trim().split("\n");
assert.equal(expected.length, names.length);
const api = await createDemangler();
for (let index = 0; index < names.length; ++index) {
  const result = api.demangle(names[index]);
  assert.equal(`${result.status} ${result.consumed}`, expected[index], names[index]);
}
console.warn(`${names.length} WASM results match the unmodified native LLVM parser.`);
