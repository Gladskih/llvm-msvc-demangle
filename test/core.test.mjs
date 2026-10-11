import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../dist/core.js";

function runtime(result = { status: "success", ast: { root: 0, nodes: [] }, consumed: 1, warnings: [] }) {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  const module = {
    HEAPU8: new Uint8Array(8192),
    _input_buffer: () => 8,
    _demangle: (length, mode) => {
      module.last = { length, mode };
      module.HEAPU8.set(bytes, 5000);
      return 5000;
    },
    _result_size: () => bytes.length,
  };
  return module;
}

test("copies ASCII bytes, selects each native entry mode, and returns detached results", () => {
  const module = runtime();
  const api = createApi(module);
  const first = api.demangle("?");
  assert.equal(first.status, "success");
  assert.equal(module.HEAPU8[8], 63);
  assert.equal(module.HEAPU8[9], 0);
  assert.deepEqual(module.last, { length: 1, mode: 0 });
  first.warnings.push("local change");
  assert.deepEqual(api.demangleType(".H").warnings, []);
  assert.deepEqual(module.last, { length: 2, mode: 1 });
});

test("invalid input returns diagnostics before accessing WASM", () => {
  const api = createApi({});
  assert.equal(api.demangle(null).status, "invalid");
  assert.equal(api.demangleType("").ast, null);
});

test("quarantines a trapped instance and reports the need to recreate it", () => {
  const module = runtime();
  module._demangle = () => { throw new WebAssembly.RuntimeError("test trap"); };
  const api = createApi(module);
  assert.match(api.demangle("?").warnings[0], /test trap/);
  assert.match(api.demangle("?").warnings[0], /new demangler/i);
});

test("handles non-Error native failures", () => {
  const module = runtime();
  module._demangle = () => { throw "unknown failure"; };
  assert.equal(createApi(module).demangle("?").status, "error");
});

for (const pointer of [0, -1, 1.5, NaN, 8191]) {
  test(`checks the input buffer pointer ${pointer}`, () => {
    const module = runtime();
    module._input_buffer = () => pointer;
    assert.match(createApi(module).demangle("??").warnings[0], /invalid memory range/);
  });
}

for (const pointer of [0, -1, 1.5, NaN, 8191]) {
  test(`checks the result pointer ${pointer}`, () => {
    const module = runtime();
    module._demangle = () => pointer;
    assert.match(createApi(module).demangle("?").warnings[0], /invalid memory range/);
  });
}

for (const size of [0, -1, 1.5, NaN, 1048577, 8192]) {
  test(`checks the result size ${size}`, () => {
    const module = runtime();
    module._result_size = () => size;
    assert.match(createApi(module).demangle("?").warnings[0], /invalid memory range/);
  });
}

test("rejects outputs over the policy limit even when they fit in WASM memory", () => {
  const module = runtime();
  module.HEAPU8 = new Uint8Array(2 * 1048576);
  module._result_size = () => 1048577;
  assert.match(createApi(module).demangle("?").warnings[0], /invalid memory range/);
});

test("uses the current memory view after WASM memory growth", () => {
  const module = runtime();
  const invoke = module._demangle;
  module._demangle = (...args) => {
    module.HEAPU8 = new Uint8Array(16384);
    return invoke(...args);
  };
  assert.equal(createApi(module).demangle("?").status, "success");
});

test("rejects a damaged UTF-8 or JSON result", () => {
  const module = runtime();
  module._demangle = () => { module.HEAPU8[5000] = 0xff; return 5000; };
  assert.equal(createApi(module).demangle("?").status, "error");
});
