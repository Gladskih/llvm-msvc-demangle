import { validateInput } from "./validation.js";

function failure(status, warning) {
  return { status, ast: null, consumed: 0, warnings: [warning] };
}

function checkedRange(pointer, size, heap) {
  if (!Number.isInteger(pointer) || pointer <= 0 || !Number.isInteger(size) ||
      size <= 0 || size > 1048576 || pointer > heap.byteLength - size) {
    throw new Error("WASM returned an invalid memory range.");
  }
  return heap.subarray(pointer, pointer + size);
}

function invoke(module, input, mode) {
  const buffer = checkedRange(module._input_buffer(), input.length + 1, module.HEAPU8);
  for (let index = 0; index < input.length; ++index) buffer[index] = input.charCodeAt(index);
  buffer[input.length] = 0;
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
    checkedRange(module._demangle(input.length, mode), module._result_size(), module.HEAPU8)));
}

export function createApi(module) {
  let failed = false;
  function run(input, mode) {
    const warning = validateInput(input);
    if (warning) return failure("invalid", warning);
    if (failed) return failure("error", "Create a new demangler after a fatal WASM failure.");
    try {
      return invoke(module, input, mode);
    } catch (error) {
      failed = true;
      return failure("error", `WASM failure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return Object.freeze({
    demangle: input => run(input, 0),
    demangleType: input => run(input, 1),
  });
}
