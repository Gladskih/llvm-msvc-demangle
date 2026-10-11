import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const sourceRoot = new URL("../.build/llvm/llvm/", import.meta.url);
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Unrecognized upstream code: ${before}`);
  return source.replace(before, after);
}
function manageOutput(source) {
  return `#include "output-buffer.h"\n${source.replaceAll("OutputBuffer OB;", "ManagedOutputBuffer OB;")
    .replaceAll("std::free(OB.getBuffer());", "")}`;
}
function prepareAllocator(source) {
  source = replaceOnce(source, "AllocatorNode *NewHead = new AllocatorNode;",
    "auto Owner = std::make_unique<AllocatorNode>();\n    AllocatorNode *NewHead = Owner.get();");
  source = replaceOnce(source, "Head = NewHead;", "Head = Owner.release();");
  source = replaceOnce(source, "size_t Size = Count * sizeof(T);",
    `if (Count > std::numeric_limits<size_t>::max() / sizeof(T)) throw std::bad_alloc{};
    size_t Size = Count * sizeof(T);`);
  assert.equal(source.split("Head->Used += Size + Adjustment;").length, 3);
  source = source.replaceAll("Head->Used += Size + Adjustment;",
    "Head->Used = checkedAdd(Head->Used, checkedAdd(Size, Adjustment));");
  source = replaceOnce(source, "Head->Used += Size;", "Head->Used = checkedAdd(Head->Used, Size);");
  return `#include "safety.h"\n#include <memory>\n${source}`;
}
function prepareUtility(source) {
  source = replaceOnce(source, "size_t Need = N + CurrentPosition;",
    "size_t Need = checkedAdd(N, CurrentPosition);");
  source = replaceOnce(source, "Need += 1024 - 32;", "Need = checkedAdd(Need, 1024 - 32);");
  source = replaceOnce(source, "BufferCapacity *= 2;",
    `if (BufferCapacity <= std::numeric_limits<size_t>::max() / 2) BufferCapacity *= 2;`);
  source = replaceOnce(source,
    `Buffer = static_cast<char *>(std::realloc(Buffer, BufferCapacity));
      if (Buffer == nullptr)
        std::abort();`,
    `char *Replacement = static_cast<char *>(std::realloc(Buffer, BufferCapacity));
      if (Replacement == nullptr) throw std::bad_alloc{};
      Buffer = Replacement;`);
  return `#include "safety.h"\n${source}`;
}

await mkdir(".build/guarded/llvm", { recursive: true });
await cp(new URL("include/llvm/Demangle", sourceRoot), ".build/guarded/llvm/Demangle",
  { recursive: true });
await writeFile(".build/MicrosoftDemangle.cpp", replaceOnce(manageOutput(await readFile(
  new URL("lib/Demangle/MicrosoftDemangle.cpp", sourceRoot), "utf8")),
"Buf = OB.getBuffer();", "Buf = OB.release();"));
await writeFile(".build/MicrosoftDemangleNodes.cpp", manageOutput(await readFile(
  new URL("lib/Demangle/MicrosoftDemangleNodes.cpp", sourceRoot), "utf8")));
await writeFile(".build/guarded/llvm/Demangle/MicrosoftDemangle.h", prepareAllocator(await readFile(
  new URL("include/llvm/Demangle/MicrosoftDemangle.h", sourceRoot), "utf8")));
await writeFile(".build/guarded/llvm/Demangle/Utility.h", prepareUtility(await readFile(
  new URL("include/llvm/Demangle/Utility.h", sourceRoot), "utf8")));
console.warn("Prepared LLVM allocation overflow checks and exception-safe temporary buffers.");
