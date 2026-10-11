import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { npmCommand } from "./npm-command.mjs";

const pack = JSON.parse(await readFile("pack-result.json"))[0];
const tarball = resolve(pack.filename);
const temporary = await mkdtemp(join(tmpdir(), "llvm-msvc-demangle-"));
async function removeTemporary() {
  if (dirname(await realpath(temporary)) !== await realpath(tmpdir())) {
    throw new Error("Refusing to delete a directory outside the temporary root");
  }
  await rm(temporary, { recursive: true, force: true });
}
try {
  const [command, ...prefix] = npmCommand();
  execFileSync(command, [...prefix, "install", "--offline", "--ignore-scripts", "--no-audit",
    "--no-fund", tarball], { cwd: temporary, stdio: "pipe" });
  await writeFile(join(temporary, "smoke.mjs"), `
    import assert from "node:assert/strict";
    import { createDemangler } from "llvm-msvc-demangle";
    import { readFile } from "node:fs/promises";
    const asset = import.meta.resolve("llvm-msvc-demangle/llvm-msvc-demangle.wasm");
    const api = await createDemangler();
    const result = api.demangleType(".?AVWidget@demo@@");
    assert.equal(result.status, "success");
    assert.equal(result.ast.nodes[0].kind, "TagType");
    assert.equal(result.ast.nodes[0].tag, "Class");
    assert.equal(api.demangle("?f@@YAHH@Z").ast.nodes[0].kind, "FunctionSymbol");
    assert.equal(api.demangle("?").status, "invalid");
    assert.equal((await createDemangler({ wasmBinary: await readFile(new URL(asset)) }))
      .demangleType(".H").status, "success");
  `);
  execFileSync(process.execPath, ["smoke.mjs"], { cwd: temporary, stdio: "pipe" });
  assert(pack.files.some(file => file.path === "dist/index.d.ts"));
  assert(pack.files.some(file => file.path === "licenses/LLVM.txt"));
} finally {
  await removeTemporary();
}
console.warn(`Installed and tested the exact tarball: ${pack.filename}`);
