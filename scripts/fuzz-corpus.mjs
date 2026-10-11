import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../.build/llvm/llvm/test/Demangle/", import.meta.url);
const names = [];
for (const file of (await readdir(root)).filter(name => name.startsWith("ms-"))) {
  names.push(...(await readFile(new URL(file, root), "utf8")).split(/\r?\n/)
    .filter(line => /^[?.]/.test(line)));
}
const corpus = new Set(names);
for (const name of names) {
  for (let length = 1; length < name.length; ++length) corpus.add(name.slice(0, length));
}
let state = 0x5eed;
function random(maximum) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state % maximum;
}
for (let index = 0; index < 20000; ++index) {
  const name = names[random(names.length)];
  const position = random(name.length);
  corpus.add(name.slice(0, position) + String.fromCharCode(0x20 + random(95)) +
    name.slice(position + 1));
}
corpus.add(`.${"PA".repeat(300)}H`);
corpus.add(`?x@@3Y${"P".repeat(16)}@HA`);
await writeFile(".build/fuzz.txt", `${[...corpus].join("\n")}\n`);
await writeFile(".build/upstream-names.json", JSON.stringify(names));
await writeFile(".build/upstream-names.txt", `${names.join("\n")}\n`);
