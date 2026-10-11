# llvm-msvc-demangle

LLVM's Microsoft C++ demangler compiled to WebAssembly, with **structured AST data**
for analysis. Parses symbol names and the dot-prefixed names stored in MSVC RTTI
TypeDescriptors. No runtime dependencies, installation scripts, native toolchain,
or external service. The npm package includes prebuilt WASM and TypeScript types.

```sh
npm install llvm-msvc-demangle
```

```js
import { createDemangler } from "llvm-msvc-demangle";

const demangler = await createDemangler();
const result = demangler.demangleType(".?AVWidget@demo@@");
if (result.status === "success") {
  const root = result.ast.nodes[result.ast.root];
  // root: { kind: "TagType", quals: [], qualifiedName: 1, tag: "Class" }
  const qualifiedName = result.ast.nodes[root.qualifiedName];
  const components = result.ast.nodes[qualifiedName.components];
  const names = components.nodes.map(id => result.ast.nodes[id]);
  // names: NamedIdentifier nodes for "demo", then "Widget".
}

const symbol = demangler.demangle("?f@@YAHH@Z");
// FunctionSymbol -> FunctionSignature: Cdecl, int return type, int parameter.
```

## API

`await createDemangler({ wasmBinary?, wasmURL? })` initializes an independent instance.
`wasmBinary` takes precedence and avoids all file/network access. Node loads the
neighboring local file by default; browsers fetch the neighboring asset. Node accepts
local file paths or file URLs, not HTTP URLs. Initialization failures reject the promise.

The returned `demangle(symbol)` and `demangleType(name)` methods are synchronous.
`demangleType` requires a dot-prefixed RTTI name and returns its **type** as the root.
`demangle` accepts ordinary symbols, special RTTI symbols and dot-prefixed type names;
the latter retain LLVM's synthetic VariableSymbol wrapper.

Each call returns `{ status, consumed, ast, warnings }`:

| Status | Meaning |
| --- | --- |
| `success` | LLVM accepted and consumed the complete input. |
| `partial` | LLVM accepted a prefix; the AST is available with a trailing-input warning. |
| `invalid` | Bad input or a name rejected by LLVM; `ast` is null. |
| `limit` | A documented resource limit was reached; `ast` is null. The instance remains usable. |
| `error` | An inconsistent AST or a fatal WASM/ABI failure; `ast` is null. |

`consumed` is the number of input bytes accepted on success/partial and zero on failure.
Malformed names return warnings without throwing. A fatal WASM trap quarantines that
instance; create a new demangler. Results own their objects and remain valid after later
calls. There are no retained per-symbol native allocations or handles to dispose.

## AST contract

`ast = { root: NodeId, nodes: AstNode[] }` is a graph. A `NodeId` indexes `nodes`;
nullable references use `null`. Back-references share the same node ID. Node IDs are
local to one result. Traverse with a visited set when processing arbitrary graphs.

- `kind` is the LLVM NodeKind name, such as `TagType`, `PointerType`, `FunctionSignature`,
  `StructorIdentifier`, `RttiBaseClassDescriptor`, or `SpecialTableSymbol`.
- All public AST fields, including inherited fields, are exported with camelCase names:
  `PrimKind` becomes `primKind`, `NVOffset` becomes `nvOffset`, and `SC` becomes `sc`.
- Scoped enums are strings with LLVM's names. Bitmask fields are arrays of LLVM flag names,
  such as `quals: ["Q_Const"]` or `functionClass: ["FC_Public", "FC_Virtual"]`.
  A zero bitmask is an empty array.
- All 64-bit integer fields are **decimal strings**. Use `BigInt(node.value)` as needed.
  `IntegerLiteral.value` is an unsigned magnitude; `isNegative` supplies its sign.
- `NodeArray.nodes` is an array of node references. Redundant `Count` is omitted.
  `thunkOffsets` contains only initialized offsets; redundant `ThunkOffsetCount` is omitted.
- Qualified-name components are ordered from outer scope to unqualified identifier.
  Identifier `templateParams` references a NodeArray when present.
- `decodedString` is LLVM's already escaped spelling, not original string-literal bytes.
  JSON preserves upstream bytes as U+0000..U+00FF without assuming they are valid UTF-8.

The complete discriminated union is generated from LLVM's header by Clang and shipped
in `dist/index.d.ts`. `dist/ast-schema.json` records the generated field and enum schema.
The API exposes LLVM's AST, not a complete C++ semantic model or lossless grammar tree.
LLVM already flattens some local/anonymous scopes to strings, and MD5 symbols do not
contain a recoverable original name. RTTI symbols can contain synthetic NamedIdentifiers
for special names. AST kinds/fields/enums are scoped to the pinned LLVM version;
review schema changes when upgrading the package.

## Browser and bundlers

Serve the WASM locally as `application/wasm`. With Vite:

```js
import { createDemangler } from "llvm-msvc-demangle";
import wasmURL from "llvm-msvc-demangle/llvm-msvc-demangle.wasm?url";

const demangler = await createDemangler({ wasmURL });
```

Other bundlers should copy the exported WASM asset and pass its local URL. Supply
`wasmBinary: Uint8Array` for fully offline use. Use a module Web Worker for large batches.
No eval/new Function is required. CSP needs `script-src 'self' 'wasm-unsafe-eval'`
and `connect-src 'self'` when fetching the WASM.

Requires **Node 24+** or a browser with standard WebAssembly exception handling:
Chrome 137+, Firefox 131+, Safari 18.4+. Native WASM exceptions allow resource-limit
failures to unwind and release temporary allocations. Chromium and module-worker
behavior are tested in CI.

## Input and resource limits

This initial API accepts printable ASCII strings, at most 4096 bytes, without NULs.
Unsupported Unicode/control bytes produce `invalid`, not a guessed decoding.
Wrapper policies are 128 active parser method frames, 32768 parser method entries,
1 MiB arena allocation, 4096 AST nodes, 1 MiB intermediate output/JSON, and 32 MiB
maximum WASM memory. These are defensive policies, not Microsoft ABI limits.
They can reject unusually complex valid names. The grammar remains LLVM's.

## Build, update and release

Linux or WSL prerequisites: Node 24+, Git, Python 3, curl and a host Clang++ for
sanitizer/differential tests. Emscripten is fetched and installed automatically.

```sh
npm ci
npm run build:wasm
npx playwright install --with-deps chromium
npm run test:native
npm run test:differential
npm run verify
npm run pack:verified
```

`EMSDK_ROOT` may point to an already installed SDK with the exact pinned commit/version.
No CMake, Ninja, TableGen, or complete LLVM checkout is needed. Only the demangler's
sources, headers, tests, and license are downloaded. The source commit and individual
SHA-256 checksums live in `upstream.json`; `dist/build-info.json` records the pins,
wrapper Git revision, and artifact sizes/hashes. No build timestamps are embedded.

Update to a release tag or an explicitly chosen main revision:

```sh
npm run upstream:update -- llvmorg-X.Y.Z
# Or: npm run upstream:update -- main
npm run build:wasm
npm run test:native
npm run test:differential
npm run verify
npm version patch  # choose minor/major for API/schema compatibility changes
git push origin main --follow-tags
```

The updater resolves the ref to an immutable commit and rehashes every source file.
Clang regenerates AST bindings automatically; unknown field shapes, node mappings,
composite flags, or changed guard insertion points fail the build for review.
Emscripten's version and SDK commit are updated explicitly in `upstream.json`.

CI rebuilds from pins, checks lint/types/100% JS coverage/focused mutations, exercises
LLVM's corpus and every truncated prefix, compares against an **unmodified native LLVM
parser**, runs ASan/UBSan on deterministic malformed inputs, tests the browser/CSP/worker,
and installs the exact npm tarball offline. The release workflow reuses that tested
tarball, verifies its SHA-256 and tag/version, and publishes with npm OIDC/provenance.
Configure npm Trusted Publishing for `Gladskih/llvm-msvc-demangle`, workflow `publish.yml`,
before automated releases (npm 11.17+):

```sh
npm trust github llvm-msvc-demangle --repo Gladskih/llvm-msvc-demangle \
  --file publish.yml --allow-publish --yes
```

The first release can be bootstrapped through an authenticated
local `npm publish <tested-tarball> --ignore-scripts --access public`.

## Sources and license

Built from LLVM 23.1.3, commit `0d261d1ca552c95a8f007e061c787ac7132fbcbc`:

- [MicrosoftDemangle.cpp](https://github.com/llvm/llvm-project/blob/0d261d1ca552c95a8f007e061c787ac7132fbcbc/llvm/lib/Demangle/MicrosoftDemangle.cpp)
- [MicrosoftDemangleNodes.h](https://github.com/llvm/llvm-project/blob/0d261d1ca552c95a8f007e061c787ac7132fbcbc/llvm/include/llvm/Demangle/MicrosoftDemangleNodes.h)
- [LLVM demangler tests](https://github.com/llvm/llvm-project/tree/0d261d1ca552c95a8f007e061c787ac7132fbcbc/llvm/test/Demangle)
- [Emscripten exception handling](https://emscripten.org/docs/porting/exceptions.html)

Wrapper: MIT. LLVM/generated artifacts: Apache-2.0 WITH LLVM-exception. Redistribute
the accompanying [third-party notices](THIRD_PARTY_NOTICES.md) and `licenses/` files.
