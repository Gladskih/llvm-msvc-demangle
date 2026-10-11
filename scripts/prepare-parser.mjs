import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const sourceRoot = new URL("../.build/llvm/llvm/", import.meta.url);
let parser = await readFile(new URL("lib/Demangle/MicrosoftDemangle.cpp", sourceRoot), "utf8");
const methods = [...parser.matchAll(/\bDemangler::\w+\(/g)];
assert(methods.length > 50, "Unexpected upstream parser layout");
// Every Demangler method gets an RAII depth/work guard, regardless of its return type.
for (const match of methods.reverse()) {
  const body = parser.indexOf("{", match.index);
  assert(body > match.index && body - match.index < 500, "Unrecognized parser method");
  parser = `${parser.slice(0, body + 1)}\n  ParseFrame parseFrame;${parser.slice(body + 1)}`;
}
function manageOutput(source) {
  return `#include "output-buffer.h"\n${source.replaceAll("OutputBuffer OB;", "ManagedOutputBuffer OB;")
    .replaceAll("std::free(OB.getBuffer());", "")}`;
}
parser = `#include "budget.h"\n${manageOutput(parser)}`;
await writeFile(".build/MicrosoftDemangle.cpp", parser);
await mkdir(".build/guarded/llvm", { recursive: true });
await cp(new URL("include/llvm/Demangle", sourceRoot), ".build/guarded/llvm/Demangle",
  { recursive: true });
let allocator = await readFile(new URL("include/llvm/Demangle/MicrosoftDemangle.h", sourceRoot), "utf8");
const before = "void addNode(size_t Capacity) {";
assert.equal(allocator.split(before).length, 2, "Unrecognized upstream arena allocator");
allocator = `#include "budget.h"\n${allocator.replace(before, `${before}\n    reserveArena(Capacity);`)}`;
// Reject a huge count before the upstream multiplication can overflow wasm32 size_t.
const allocation = "size_t Size = Count * sizeof(T);";
assert.equal(allocator.split(allocation).length, 2, "Unrecognized upstream array allocator");
allocator = allocator.replace(allocation,
  `if (Count > 1048576 / sizeof(T)) throw LimitExceeded{};\n    ${allocation}`);
await writeFile(".build/guarded/llvm/Demangle/MicrosoftDemangle.h", allocator);
let utility = await readFile(new URL("include/llvm/Demangle/Utility.h", sourceRoot), "utf8");
const growth = "void grow(size_t N) {";
assert.equal(utility.split(growth).length, 2, "Unrecognized upstream output buffer");
utility = `#include "budget.h"\n${utility.replace(growth,
  `${growth}\n    if (N > 1048576 - CurrentPosition) throw LimitExceeded{};`)}`;
await writeFile(".build/guarded/llvm/Demangle/Utility.h", utility);
const nodes = await readFile(new URL("lib/Demangle/MicrosoftDemangleNodes.cpp", sourceRoot), "utf8");
await writeFile(".build/MicrosoftDemangleNodes.cpp", manageOutput(nodes));
console.warn(`Guarded ${methods.length} parser methods and bounded LLVM's arena allocations.`);
