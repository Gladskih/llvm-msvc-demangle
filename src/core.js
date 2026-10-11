import { validateInput } from "./validation.js";

function failure(status, warning) {
  return { status, ast: null, consumed: 0, warnings: [warning] };
}

function checkedRange(pointer, size, heap) {
  // WebAssembly i32 exports represent addresses above 2 GiB as signed integers.
  const address = pointer < 0 ? pointer + 2 ** 32 : pointer;
  const length = size < 0 ? size + 2 ** 32 : size;
  if (!Number.isInteger(address) || address <= 0 || !Number.isInteger(length) ||
      length <= 0 || address > heap.byteLength - length) {
    throw new Error("WASM returned an invalid memory range.");
  }
  return heap.subarray(address, address + length);
}

function invoke(module, input, mode) {
  const pointer = module._input_buffer(input.length);
  if (pointer === 0) return failure("limit", "Unable to allocate WASM input memory.");
  const buffer = checkedRange(pointer, input.length + 1, module.HEAPU8);
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
