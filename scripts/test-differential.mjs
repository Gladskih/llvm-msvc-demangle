import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDemangler } from "../dist/node.js";

const names = JSON.parse(await readFile(".build/upstream-names.json"));
const expected = (await readFile(".build/oracle-results.txt", "utf8")).trim().split("\n");
assert.equal(expected.length, names.length);
const api = await createDemangler();
for (let index = 0; index < names.length; ++index) {
  const result = api.demangle(names[index]);
  const [status, consumed, symbol, type] = expected[index].split(" ");
  assert.equal(`${result.status} ${result.consumed}`, `${status} ${consumed}`, names[index]);
  const formatted = api.demangleWithText(names[index]);
  assert.deepEqual(formatted, { ...result,
    text: result.ast ? Buffer.from(symbol === "-" ? "" : symbol, "hex").toString("latin1") : null,
  }, names[index]);
  if (type !== "-") {
    assert.deepEqual(api.demangleTypeWithText(names[index]), {
      ...api.demangleType(names[index]), text: Buffer.from(type, "hex").toString("latin1"),
    }, names[index]);
  }
}
console.warn(`${names.length} WASM results and native presentations match unmodified LLVM.`);
