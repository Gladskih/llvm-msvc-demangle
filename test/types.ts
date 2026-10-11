import { createDemangler, type AstNode, type DemangleResult,
  type DemangleWithTextResult } from "llvm-msvc-demangle";

const api = await createDemangler();
const result: DemangleResult = api.demangleType(".?AVWidget@demo@@");
if (result.ast) {
  const node: AstNode = result.ast.nodes[result.ast.root]!;
  if (node.kind === "TagType") {
    const tag: "Class" | "Struct" | "Union" | "Enum" = node.tag;
    void tag;
  }
  if (node.kind === "IntegerLiteral") {
    const magnitude: bigint = BigInt(node.value);
    void magnitude;
  }
  // @ts-expect-error The discriminated union must reject nonexistent fields.
  void node.nonexistent;
}
// @ts-expect-error Symbol API accepts strings.
api.demangle(1);

const formatted: DemangleWithTextResult = api.demangleWithText("?f@@YAHH@Z");
if (formatted.ast) {
  const text: string = formatted.text;
  const node: AstNode = formatted.ast.nodes[formatted.ast.root]!;
  void [text, node];
} else {
  const text: null = formatted.text;
  const ast: null = formatted.ast;
  void [text, ast];
}
const type = api.demangleTypeWithText(".H");
if (type.ast) {
  const text: string = type.text;
  void text;
}
// @ts-expect-error Analysis-only results do not carry presentation text.
void result.text;
// @ts-expect-error Formatted methods have no boolean formatting flag.
api.demangleWithText("?f@@YAHH@Z", true);
