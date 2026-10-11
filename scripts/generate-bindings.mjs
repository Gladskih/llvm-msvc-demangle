// Clang, rather than a handwritten C++ parser, supplies every inherited field and enum.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const namespace = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.equal(namespace.kind, "NamespaceDecl");
assert.equal(namespace.name, "ms_demangle");
const declarations = namespace.inner;
const records = new Map(declarations.filter(node => node.kind === "CXXRecordDecl" &&
  node.completeDefinition).map(node => [node.name, node]));
assert.deepEqual(records.get("Node").inner.filter(node => node.kind === "FieldDecl")
  .map(node => [node.name, node.type.qualType]), [["Kind", "NodeKind"]],
"The base Node now has fields that need an explicit serialization policy");
const enums = declarations.filter(node => node.kind === "EnumDecl");
const enumNames = new Set(enums.map(node => node.name));
const flags = new Set(["Qualifiers", "FuncClass", "OutputFlags"]);
const concrete = { Md5Symbol: "SymbolNode", Custom: "CustomTypeNode", IntrinsicType: "IntrinsicNode" };
const kinds = enums.find(node => node.name === "NodeKind").inner
  .filter(node => node.kind === "EnumConstantDecl")
  .map(node => node.name).filter(name => name !== "Unknown" && !/Start$|End$/.test(name));
const cpp = [];
const types = ["// Generated from the pinned LLVM header by Clang. Do not edit.",
  "export type NodeId = number;"];
const schema = { nodes: {}, enums: {} };

function enumValue(node) {
  if (node.kind === "ConstantExpr" && node.value !== undefined) return Number(node.value);
  for (const child of node.inner ?? []) {
    const value = enumValue(child);
    if (value !== undefined) return value;
  }
}

function emitEnum(declaration) {
  let previous = -1;
  const members = declaration.inner.filter(node => node.kind === "EnumConstantDecl")
    .map(node => ({ name: node.name, value: previous = enumValue(node) ?? previous + 1 }));
  schema.enums[declaration.name] = members;
  if (declaration.name === "NodeKind") return;
  types.push(`export type ${declaration.name} = ${flags.has(declaration.name) ? "ReadonlyArray<" : ""}` +
    members.map(member => JSON.stringify(member.name)).join(" | ") +
    `${flags.has(declaration.name) ? ">" : ""};`);
  cpp.push(`[[maybe_unused]] static void writeEnum(Json &out, ${declaration.name} value) {`);
  if (flags.has(declaration.name)) {
    cpp.push("out.raw(\"[\"); bool separator = false;");
    for (const { name, value } of members.filter(member => member.value !== 0)) {
      assert.equal(value & (value - 1), 0, `Unreviewed composite flag: ${name}`);
      cpp.push(`if (value & ${name}) { if (separator) out.raw(",");` +
        ` out.string("${name}"); separator = true; }`);
    }
    cpp.push("out.raw(\"]\");");
  } else {
    cpp.push("switch (value) {");
    for (const { name } of members) {
      cpp.push(`case ${declaration.name}::${name}: out.string("${name}"); return;`);
    }
    cpp.push("} throw InvalidAst{};");
  }
  cpp.push("}");
}

function fields(record) {
  if (record.name === "Node") return [];
  const bases = (record.bases ?? []).flatMap(base => {
    const name = base.type.qualType.split("::").at(-1);
    assert(records.has(name), `Unknown base class ${name}`);
    return fields(records.get(name));
  });
  return [...bases, ...record.inner.filter(node => node.kind === "FieldDecl")];
}

function property(name) {
  return name.replace(/^[A-Z]+(?=[A-Z][a-z]|$)/, prefix => prefix.toLowerCase())
    .replace(/^[A-Z]/, prefix => prefix.toLowerCase());
}

function describe(field, record) {
  const type = field.type.qualType.replace(/llvm::ms_demangle::/g, "");
  const expression = `value->${field.name}`;
  if (/^\w+Node \*$/.test(type)) {
    return { type: "NodeId | null", code: `graph.reference(out, ${expression});` };
  }
  if (enumNames.has(type)) return { type, code: `writeEnum(out, ${expression});` };
  if (type === "std::string_view") return { type: "string", code: `out.string(${expression});` };
  if (type === "bool") return { type: "boolean", code: `out.boolean(${expression});` };
  if (/^(u?int(32|64)_t|int|size_t)$/.test(type)) {
    return /64/.test(type)
      ? { type: "string", code: `out.string(std::to_string(${expression}));` }
      : { type: "number", code: `out.number(${expression});` };
  }
  if (type === "ThisAdjustor") {
    const nested = record.inner.find(node => node.name === type && node.completeDefinition);
    const members = fields(nested);
    const code = members.map(member => `out.key("${property(member.name)}"); ` +
      `out.number(${expression}.${member.name});`).join("\n");
    return { type: `{ ${members.map(member => `${property(member.name)}: number`).join("; ")} }`,
      code: `out.raw("{"); ${code} out.raw("}");` };
  }
  throw new Error(`Unreviewed LLVM AST field: ${record.name}.${field.name}: ${type}`);
}

function emitNode(kind) {
  const record = records.get(concrete[kind] ?? `${kind}Node`);
  assert(record, `Unmapped LLVM NodeKind: ${kind}`);
  cpp.push(`case NodeKind::${kind}: {`, `const auto *value = static_cast<const ${record.name} *>(node);`,
    `(void)value; out.key("kind"); out.string("${kind}");`);
  const properties = [];
  for (const field of fields(record)) {
    if (field.name === "Count" && kind === "NodeArray") continue;
    if (field.name === "ThunkOffsetCount" && kind === "TemplateParameterReference") continue;
    const name = property(field.name);
    let info;
    if (field.name === "Nodes" && kind === "NodeArray") {
      info = { type: "Array<NodeId | null>", code: "graph.array(out, value->Nodes, value->Count);" };
    } else if (field.name === "ThunkOffsets" && kind === "TemplateParameterReference") {
      info = { type: "string[]", code: "graph.offsets(out, *value);" };
    } else {
      info = describe(field, record);
    }
    properties.push(`  ${name}: ${info.type};`);
    cpp.push(`out.key("${name}"); ${info.code}`);
  }
  cpp.push("return; }");
  schema.nodes[kind] = properties;
  types.push(`export interface ${kind}Node {`, `  kind: "${kind}";`, ...properties, "}");
}

enums.forEach(emitEnum);
cpp.push("static void writeFields(Graph &graph, Json &out, const Node *node) {",
  "switch (node->kind()) {", "case NodeKind::Unknown: throw InvalidAst{};");
kinds.forEach(emitNode);
cpp.push("} throw InvalidAst{}; }");
types.push(`export type AstNode = ${kinds.map(kind => `${kind}Node`).join(" | ")};`);
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/ast-fields.inc", cpp.join("\n"));
await writeFile("artifacts/ast.d.ts", `${types.join("\n")}\n`);
await writeFile("artifacts/ast-schema.json", `${JSON.stringify(schema, null, 2)}\n`);
console.warn(`Generated ${kinds.length} node kinds from Clang's LLVM AST.`);
