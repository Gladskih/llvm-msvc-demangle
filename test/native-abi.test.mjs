import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import createModule from "../dist/llvm-msvc-demangle.js";

const module = await createModule({ wasmBinary: await readFile(
  new URL("../dist/llvm-msvc-demangle.wasm", import.meta.url)), printErr: () => {} });
function invoke(length, mode) {
  const pointer = module._demangle(length, mode);
  return JSON.parse(new TextDecoder().decode(module.HEAPU8.subarray(pointer,
    pointer + module._result_size())));
}

test("native ABI rejects invalid lengths and modes before reading input", () => {
  assert.equal(invoke(0, 0).status, "invalid");
  assert.equal(invoke(4097, 0).status, "invalid");
  assert.equal(invoke(-1, 0).status, "invalid");
  assert.equal(invoke(1, 2).status, "invalid");
});

test("native ABI rejects embedded NUL, controls and non-ASCII bytes", () => {
  module.HEAPU8[module._input_buffer()] = 0;
  assert.equal(invoke(1, 0).status, "invalid");
  module.HEAPU8[module._input_buffer()] = 0xff;
  assert.equal(invoke(1, 0).status, "invalid");
  module.HEAPU8[module._input_buffer()] = 0x1f;
  assert.equal(invoke(1, 0).status, "invalid");
});
