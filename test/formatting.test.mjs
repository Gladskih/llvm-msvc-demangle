import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemangler } from "../dist/node.js";

const api = await createDemangler();

// MicrosoftDemangleNodes.cpp: FunctionSymbolNode::output and TypeNode::output.
for (const [input, text] of [
  ["?f@@YAHH@Z", "int __cdecl f(int)"],
  ["?x@@3HA", "int x"],
  ["??_R1A@?0A@EA@Base@@8", "Base::`RTTI Base Class Descriptor at (0, -1, 0, 64)'"],
]) {
  test(`native symbol formatting preserves the AST for ${input}`, () => {
    const result = api.demangleWithText(input);
    assert.equal(result.text, text);
    const { text: ignored, ...analysis } = result;
    assert.deepEqual(analysis, api.demangle(input));
    assert(!Object.hasOwn(api.demangle(input), "text"));
    void ignored;
  });
}

for (const [input, text] of [
  [".?AVWidget@demo@@", "class demo::Widget"],
  [".?AV?$C@H@@", "class C<int>"],
  [".H", "int"],
  [".PEAH", "int *"],
]) {
  test(`native RTTI formatting renders the extracted type for ${input}`, () => {
    const result = api.demangleTypeWithText(input);
    assert.equal(result.text, text);
    const { text: ignored, ...analysis } = result;
    assert.deepEqual(analysis, api.demangleType(input));
    void ignored;
  });
}

test("formatted partial symbols retain warnings and only format the consumed prefix", () => {
  assert.deepEqual(api.demangleWithText("?x@@3HAtrailing"), {
    ...api.demangle("?x@@3HAtrailing"), text: "int x",
  });
});

test("formatted failures return null text and leave the instance reusable", () => {
  for (const input of [null, "", "?", "hello", "\u00ff"]) {
    assert.deepEqual(api.demangleWithText(input), { ...api.demangle(input), text: null });
    assert.deepEqual(api.demangleTypeWithText(input), { ...api.demangleType(input), text: null });
  }
  assert.deepEqual(api.demangleTypeWithText("?f@@YAHH@Z"), {
    ...api.demangleType("?f@@YAHH@Z"), text: null,
  });
  assert.equal(api.demangleWithText("?f@@YAHH@Z").text, "int __cdecl f(int)");
});

test("native formatting preserves escaped string literal bytes and braces", () => {
  // llvm/test/Demangle/ms-string-literals.test.
  assert.equal(api.demangleWithText("??_C@_01CELHOKLL@?$HN?$AA@").text, '"}"');
  assert.equal(api.demangleTypeWithText(".?AV{Widget}@@").text, "class {Widget}");
});

test("formatted strings have no output policy cap and remain valid after later calls", () => {
  const name = "L".repeat(2 * 1024 * 1024);
  const result = api.demangleTypeWithText(`.?AV${name}@@`);
  assert.equal(result.status, "success");
  assert.equal(result.text, `class ${name}`);
  assert.equal(api.demangleTypeWithText(".H").text, "int");
  assert.equal(result.text, `class ${name}`);
});
