import { createDemangler, type AstNode, type DemangleResult } from "llvm-msvc-demangle";

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
