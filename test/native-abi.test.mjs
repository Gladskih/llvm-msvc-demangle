import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import createModule from "../dist/llvm-msvc-demangle.js";

const module = await createModule({ wasmBinary: await readFile(
  new URL("../dist/llvm-msvc-demangle.wasm", import.meta.url)), printErr: () => {} });
function invoke(length, mode, entry = module._demangle) {
  const pointer = entry(length, mode);
  return JSON.parse(new TextDecoder().decode(module.HEAPU8.subarray(pointer,
    pointer + module._result_size())));
}

test("native ABI rejects invalid lengths and modes before reading input", () => {
  assert.equal(invoke(0, 0).status, "invalid");
  module._input_buffer(17);
  assert.equal(invoke(18, 0).status, "invalid");
  assert.equal(invoke(-1, 0).status, "invalid");
  assert.equal(invoke(1, 2).status, "invalid");
});

test("formatted native ABI validates the same lengths, modes and bytes before formatting", () => {
  assert.equal(invoke(0, 0, module._demangle_with_text).status, "invalid");
  const pointer = module._input_buffer(1);
  module.HEAPU8[pointer] = 0;
  assert.equal(invoke(1, 0, module._demangle_with_text).status, "invalid");
  assert.equal(invoke(2, 0, module._demangle_with_text).status, "invalid");
  module.HEAPU8[pointer] = 63;
  assert.equal(invoke(1, 2, module._demangle_with_text).status, "invalid");
});

test("native ABI rejects embedded NUL, controls and non-ASCII bytes", () => {
  module.HEAPU8[module._input_buffer(1)] = 0;
  assert.equal(invoke(1, 0).status, "invalid");
  module.HEAPU8[module._input_buffer(1)] = 0xff;
  assert.equal(invoke(1, 0).status, "invalid");
  module.HEAPU8[module._input_buffer(1)] = 0x1f;
  assert.equal(invoke(1, 0).status, "invalid");
});

test("native ABI rejects size_t overflow without losing the existing buffer", () => {
  const pointer = module._input_buffer(1);
  module.HEAPU8[pointer] = 63;
  assert.equal(module._input_buffer(-1), 0);
  assert.equal(invoke(1, 0).status, "invalid");
  const restored = module._input_buffer(2);
  module.HEAPU8.set([46, 72], restored);
  assert.equal(invoke(2, 0).status, "success");
});

test("native input allocation grows WASM memory beyond the former 32 MiB ceiling", () => {
  const pointer = module._input_buffer(33 * 1024 * 1024);
  assert.notEqual(pointer, 0);
  assert(module.HEAPU8.byteLength > 33 * 1024 * 1024);
  module.HEAPU8.set([46, 72], pointer);
  assert.equal(invoke(2, 0).status, "success");
});
