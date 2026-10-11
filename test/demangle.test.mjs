import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemangler } from "../dist/node.js";

const api = await createDemangler();
function find(result, kind) {
  assert.equal(result.status, "success", JSON.stringify(result.warnings));
  return result.ast.nodes.find(node => node.kind === kind);
}

test("extracts a scoped RTTI class type without a synthetic symbol name", () => {
  const result = api.demangleType(".?AVWidget@demo@@");
  assert.deepEqual(result.ast.nodes[result.ast.root], {
    kind: "TagType", quals: [], qualifiedName: 1, tag: "Class",
  });
  assert.deepEqual(result.ast.nodes.filter(node => node.kind === "NamedIdentifier")
    .map(node => node.name), ["demo", "Widget"]);
  assert.equal(result.consumed, 17);
});

test("handles RTTI structs, enums, primitive and pointer types", () => {
  assert.equal(find(api.demangleType(".?AUS@@"), "TagType").tag, "Struct");
  assert.equal(find(api.demangleType(".?AW4E@@"), "TagType").tag, "Enum");
  assert.equal(find(api.demangleType(".H"), "PrimitiveType").primKind, "Int");
  assert.equal(find(api.demangleType(".PEAH"), "PointerType").affinity, "Pointer");
});

test("exports function calling convention, parameters and return type", () => {
  const result = api.demangle("?f@@YAHH@Z");
  const signature = find(result, "FunctionSignature");
  assert.equal(signature.callConvention, "Cdecl");
  assert.deepEqual(signature.functionClass, ["FC_Global"]);
  assert.equal(result.ast.nodes[signature.returnType].primKind, "Int");
  assert.equal(result.ast.nodes[signature.params].nodes.length, 1);
});

test("retains templates and lossless 64-bit integer magnitudes", () => {
  // Constructed with demangleNumber's A..P hexadecimal digits in MicrosoftDemangle.cpp.
  const result = api.demangle("??$f@$0PPPPPPPPPPPPPPPP@@@YAXXZ");
  assert.equal(find(result, "IntegerLiteral").value, "18446744073709551615");
  assert.equal(find(result, "IntegerLiteral").isNegative, false);
});

test("retains a template type's nested arguments", () => {
  const result = api.demangleType(".?AV?$C@H@@");
  const identifier = find(result, "NamedIdentifier");
  assert.equal(identifier.name, "C");
  assert.notEqual(identifier.templateParams, null);
  assert.equal(find(result, "PrimitiveType").primKind, "Int");
});

test("preserves braces and escaped bytes in LLVM string literals", () => {
  // llvm/test/Demangle/ms-string-literals.test: the closing brace triggered a writer regression.
  assert.equal(find(api.demangle("??_C@_01CELHOKLL@?$HN?$AA@"),
    "EncodedStringLiteral").decodedString, "}");
  assert.equal(find(api.demangleType(".?AV{Widget}@@"), "NamedIdentifier").name, "{Widget}");
});

test("exports RTTI base descriptor offsets and flags as typed fields", () => {
  // llvm/test/Demangle/ms-operators.test: RTTI Base Class Descriptor (0,-1,0,64).
  const result = api.demangle("??_R1A@?0A@EA@Base@@8");
  assert.deepEqual(find(result, "RttiBaseClassDescriptor"), {
    kind: "RttiBaseClassDescriptor", templateParams: null,
    nvOffset: 0, vbPtrOffset: -1, vbTableOffset: 0, flags: 64,
  });
});

test("returns partial ASTs with explicit unconsumed input diagnostics", () => {
  const result = api.demangle("?x@@3HAtrailing");
  assert.equal(result.status, "partial");
  assert.equal(result.consumed, 7);
  assert.match(result.warnings[0], /Trailing/);
  assert.equal(result.ast.nodes[0].kind, "VariableSymbol");
});

test("invalid, truncated, and mismatched inputs return warnings", () => {
  assert.equal(api.demangle("hello").status, "invalid");
  assert.equal(api.demangle("?").status, "invalid");
  assert.equal(api.demangleType("?x@@3HA").status, "invalid");
  assert.equal(api.demangleType(".?AVX@@junk").status, "invalid");
  assert.equal(api.demangle("??").ast, null);
});

test("parses nested types beyond the former parser depth policy", () => {
  const result = api.demangleType(`.${"PA".repeat(300)}H`);
  assert.equal(result.status, "success", JSON.stringify(result.warnings));
  assert.equal(result.ast.nodes.filter(node => node.kind === "PointerType").length, 300);
  assert.equal(api.demangle("?x@@3HA").status, "success");
});

test("parses large names and outputs with memory growth beyond the former 32 MiB cap", () => {
  const name = "L".repeat(12 * 1024 * 1024);
  const result = api.demangleType(`.?AV${name}@@`);
  assert.equal(result.status, "success", JSON.stringify(result.warnings));
  assert.equal(find(result, "NamedIdentifier").name, name);
  assert.equal(result.consumed, name.length + 6);
  assert.equal(api.demangleType(".H").status, "success");
});

test("exports wide templates beyond the former node, arena and parser work policies", () => {
  const result = api.demangleType(`.?AV?$Wide@${"H".repeat(40000)}@@`);
  const identifier = find(result, "NamedIdentifier");
  const parameters = result.ast.nodes[identifier.templateParams];
  assert.equal(parameters.nodes.length, 40000);
  assert.equal(result.ast.nodes.filter(node => node.kind === "PrimitiveType").length, 40000);
  assert.equal(result.ast.nodes[parameters.nodes.at(-1)].primKind, "Int");
});

test("results remain independent across calls and instances", async () => {
  const first = api.demangleType(".?AVFirst@@");
  api.demangleType(".?AVSecond@@");
  assert.equal(find(first, "NamedIdentifier").name, "First");
  assert.equal(find((await createDemangler()).demangleType(".?AVThird@@"),
    "NamedIdentifier").name, "Third");
});
