import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const generator = fileURLToPath(new URL("../scripts/generate-bindings.mjs", import.meta.url));
const ast = JSON.parse(await readFile(new URL("../.build/ast.json", import.meta.url)));
async function fixture(context, value) {
  const path = await mkdtemp(join(tmpdir(), "demangle-bindings-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  await writeFile(join(path, "ast.json"), JSON.stringify(value));
  return path;
}

function definition(value, name) {
  return value.inner.find(node => node.name === name && node.completeDefinition);
}

test("generates all current node kinds and inherited fields from Clang", async context => {
  const path = await fixture(context, ast);
  execFileSync(process.execPath, [generator, "ast.json"], { cwd: path, stdio: "pipe" });
  const schema = JSON.parse(await readFile(join(path, "artifacts/ast-schema.json")));
  assert.equal(Object.keys(schema.nodes).length, 28);
  assert(schema.nodes.ThunkSignature.some(field => field.includes("returnType")));
  assert(schema.nodes.TemplateParameterReference.some(field => field.includes("thunkOffsets")));
  assert(!schema.nodes.NodeArray.some(field => field.includes("count")));
});

test("rejects unknown AST field types", async context => {
  const value = structuredClone(ast);
  definition(value, "TagTypeNode").inner.push({ kind: "FieldDecl", name: "NewField",
    type: { qualType: "UnreviewedType" } });
  const path = await fixture(context, value);
  const result = spawnSync(process.execPath, [generator, "ast.json"], { cwd: path });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /Unreviewed LLVM AST field/);
});

test("rejects silently lost base-node fields", async context => {
  const value = structuredClone(ast);
  definition(value, "Node").inner.push({ kind: "FieldDecl", name: "NewField",
    type: { qualType: "int" } });
  const path = await fixture(context, value);
  const result = spawnSync(process.execPath, [generator, "ast.json"], { cwd: path });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /explicit serialization policy/);
});

test("rejects an unmapped LLVM node kind", async context => {
  const value = structuredClone(ast);
  value.inner.find(node => node.name === "NodeKind").inner.push({
    kind: "EnumConstantDecl", name: "NewNodeKind",
  });
  const path = await fixture(context, value);
  const result = spawnSync(process.execPath, [generator, "ast.json"], { cwd: path });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /Unmapped LLVM NodeKind/);
});
