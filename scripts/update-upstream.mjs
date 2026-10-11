// Maintainer-only network access. Consumers always use the packaged local WASM.
import { readFile, writeFile } from "node:fs/promises";
import { download, sha256 } from "./source-files.mjs";

const ref = process.argv[2];
if (!ref || !/^[\w./-]+$/.test(ref)) throw new Error("Usage: npm run upstream:update -- llvmorg-X.Y.Z");
const api = "https://api.github.com/repos/llvm/llvm-project";
const commit = JSON.parse(await download(`${api}/commits/${encodeURIComponent(ref)}`)).sha;
const directories = ["llvm/include/llvm/Demangle", "llvm/test/Demangle"];
const paths = ["llvm/lib/Demangle/MicrosoftDemangle.cpp",
  "llvm/lib/Demangle/MicrosoftDemangleNodes.cpp", "llvm/lib/Demangle/ItaniumDemangle.cpp",
  "llvm/LICENSE.TXT"];
for (const directory of directories) {
  const files = JSON.parse(await download(`${api}/contents/${directory}?ref=${commit}`));
  paths.push(...files.filter(file => /\.(h|def)$|\/ms-[\w-]+\.test$/.test(file.path))
    .map(file => file.path));
}
const hashes = {};
for (const path of paths.sort()) {
  hashes[path] = sha256(await download(
    `https://raw.githubusercontent.com/llvm/llvm-project/${commit}/${path}`));
}
const previous = JSON.parse(await readFile(new URL("../upstream.json", import.meta.url)));
const pin = { ...previous, llvmVersion: ref, llvmCommit: commit, files: hashes };
await writeFile(new URL("../upstream.json", import.meta.url), `${JSON.stringify(pin, null, 2)}\n`);
console.warn(`Pinned ${ref} (${commit}); build and run the full verification before release.`);
