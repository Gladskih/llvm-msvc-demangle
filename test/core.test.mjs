import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../dist/core.js";

function runtime(result = { status: "success", ast: { root: 0, nodes: [] }, consumed: 1, warnings: [] }) {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  const module = {
    HEAPU8: new Uint8Array(8192),
    _input_buffer: length => { module.allocated = length; return 8; },
    _demangle: (length, mode) => {
      module.last = { length, mode };
      module.HEAPU8.set(bytes, 5000);
      return 5000;
    },
    _result_size: () => bytes.length,
  };
  module._demangle_with_text = (length, mode) => {
    module.formatted = true;
    return module._demangle(length, mode);
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
  assert.equal(module.allocated, 1);
  assert.deepEqual(module.last, { length: 1, mode: 0 });
  first.warnings.push("local change");
  assert.deepEqual(api.demangleType(".H").warnings, []);
  assert.deepEqual(module.last, { length: 2, mode: 1 });
});

test("formatted methods select the native formatter and default failure text to null", () => {
  const module = runtime({ status: "success", text: "int", ast: { root: 0, nodes: [] },
    consumed: 2, warnings: [] });
  const api = createApi(module);
  assert.equal(api.demangle("?").status, "success");
  assert.equal(module.formatted, undefined);
  assert.equal(api.demangleWithText("?").text, "int");
  assert.deepEqual(module.last, { length: 1, mode: 0 });
  assert.equal(module.formatted, true);
  assert.equal(api.demangleTypeWithText(".H").text, "int");
  assert.deepEqual(module.last, { length: 2, mode: 1 });
  assert.deepEqual(api.demangleWithText(null), { ...api.demangle(null), text: null });
  module._input_buffer = () => 0;
  assert.equal(api.demangleTypeWithText(".H").text, null);
});

test("formatter traps quarantine both formatted and analysis methods", () => {
  const module = runtime();
  module._demangle_with_text = () => { throw new WebAssembly.RuntimeError("formatter trap"); };
  const api = createApi(module);
  const result = api.demangleWithText("?");
  assert.equal(result.status, "error");
  assert.equal(result.text, null);
  assert.match(result.warnings[0], /formatter trap/);
  assert.equal(api.demangle("?").status, "error");
  assert.equal(api.demangleTypeWithText(".H").text, null);
});

test("a missing formatter export fails instead of silently returning analysis without text", () => {
  const module = runtime();
  delete module._demangle_with_text;
  const result = createApi(module).demangleWithText("?");
  assert.equal(result.status, "error");
  assert.equal(result.text, null);
  assert.equal(result.ast, null);
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

for (const pointer of [-1, -(2 ** 32), 1.5, NaN, 8191]) {
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

for (const size of [0, -1, -(2 ** 32), 1.5, NaN, 8192]) {
  test(`checks the result size ${size}`, () => {
    const module = runtime();
    module._result_size = () => size;
    assert.match(createApi(module).demangle("?").warnings[0], /invalid memory range/);
  });
}

test("accepts outputs over 1 MiB when they fit in WASM memory", () => {
  const result = { status: "invalid", ast: null, consumed: 0,
    warnings: ["x".repeat(1048577)] };
  const module = runtime(result);
  module.HEAPU8 = new Uint8Array(2 * 1048576);
  assert.deepEqual(createApi(module).demangle("?"), result);
});

test("allocation failure returns a diagnostic and permits a later retry", () => {
  const module = runtime();
  const allocate = module._input_buffer;
  module._input_buffer = () => 0;
  const api = createApi(module);
  assert.match(api.demangle("?").warnings[0], /allocate/);
  assert.equal(api.demangle("?").status, "limit");
  module._input_buffer = allocate;
  assert.equal(api.demangle("?").status, "success");
});

test("handles signed wasm32 addresses above 2 GiB without truncating them", () => {
  const module = runtime();
  const original = module.HEAPU8;
  module.HEAPU8 = {
    byteLength: 2 ** 32,
    subarray: (start, end) => {
      if (start === 2 ** 31) return original.subarray(8, 8 + end - start);
      return original.subarray(start, end);
    },
    set: (...args) => original.set(...args),
  };
  module._input_buffer = () => -(2 ** 31);
  assert.equal(createApi(module).demangle("?").status, "success");
  assert.equal(original[8], 63);
});

test("checks signed wasm32 result lengths against actual memory", () => {
  const module = runtime();
  const original = module.HEAPU8;
  module.HEAPU8 = {
    byteLength: 2 ** 32,
    subarray: (start, end) => {
      if (start === 8) return original.subarray(start, end);
      assert.equal(end - start, 2 ** 31);
      return original.subarray(start, start + 2);
    },
    set: (...args) => original.set(...args),
  };
  module._result_size = () => -(2 ** 31);
  module._demangle = () => { original.set([123, 125], 5000); return 5000; };
  assert.deepEqual(createApi(module).demangle("?"), {});
});

test("uses the current memory view after input allocation grows memory", () => {
  const module = runtime();
  module._input_buffer = () => { module.HEAPU8 = new Uint8Array(16384); return 8; };
  assert.equal(createApi(module).demangle("?").status, "success");
  assert.equal(module.HEAPU8[8], 63);
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
