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

const display = demangler.demangleWithText("?f@@YAHH@Z");
// { ...symbol, text: "int __cdecl f(int)" }
const typeDisplay = demangler.demangleTypeWithText(".?AVWidget@demo@@");
// { ...result, text: "class demo::Widget" }
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

`demangleWithText(symbol)` and `demangleTypeWithText(name)` return the same analysis
plus `text`: LLVM's native presentation with `OF_Default`, or `null` on failure.
The RTTI variant formats the extracted type. Each call parses once and formats that
AST inside WASM before releasing it; no AST round trip or second parse is needed.
The original methods do not invoke the presentation formatter or return a `text` field.
LLVM may internally render individual name components while parsing in either path.
All four methods are synchronous. Formatting is opt-in through the method name,
without an argument flag. Text bytes use the same U+0000..U+00FF mapping as AST strings.

Each call returns `{ status, consumed, ast, warnings }`:

| Status | Meaning |
| --- | --- |
| `success` | LLVM accepted and consumed the complete input. |
| `partial` | LLVM accepted a prefix; the AST is available with a trailing-input warning. |
| `invalid` | Bad input or a name rejected by LLVM; `ast` is null. |
| `limit` | An allocation failed or its size cannot fit the target address space; `ast` is null. |
| `error` | An inconsistent AST or a fatal WASM/ABI failure; `ast` is null. |

`consumed` is the number of input bytes accepted on success/partial and zero on failure.
Malformed names return warnings without throwing. A fatal WASM trap quarantines that
instance; create a new demangler. Results own their objects and remain valid after later
calls. Input/output storage can retain capacity for reuse; there are no per-symbol
native handles to dispose.

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
Chrome 137+, Firefox 131+, Safari 18.4+. Native WASM exceptions allow allocation
failures to unwind and release temporary allocations. Chromium and module-worker
behavior are tested in CI.

## Input and resources

This API accepts printable ASCII strings without NULs.
Unsupported Unicode/control bytes produce `invalid`, not a guessed decoding.
The package imposes no policy caps on input length, parser depth/work, AST node count,
arena allocation or output size. Input storage is dynamic; WASM memory grows up to the
wasm32 address-space ceiling, subject to the host's available memory. Integer-overflow
and actual memory-range checks remain in place. LLVM's recursive parser is subject to
the runtime's finite stack; exhausting it can trap and require a new instance.
Use a terminable Worker when the application needs a time budget for untrusted input.
The grammar remains LLVM's.

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
composite flags, or changed safety-patch insertion points fail the build for review.
Emscripten's version and SDK commit are updated explicitly in `upstream.json`.

CI rebuilds from pins, checks lint/types/100% JS coverage/focused mutations, exercises
LLVM's corpus and every truncated prefix, compares against an **unmodified native LLVM
parser and formatter**, runs ASan/UBSan on deterministic malformed inputs, tests the browser/CSP/worker,
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

Source and toolchain revisions are recorded in [`upstream.json`](upstream.json). Upstream references:

- [MicrosoftDemangle.cpp](https://github.com/llvm/llvm-project/blob/main/llvm/lib/Demangle/MicrosoftDemangle.cpp)
- [MicrosoftDemangleNodes.h](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/Demangle/MicrosoftDemangleNodes.h)
- [LLVM demangler tests](https://github.com/llvm/llvm-project/tree/main/llvm/test/Demangle)
- [Emscripten exception handling](https://emscripten.org/docs/porting/exceptions.html)

Wrapper: MIT. LLVM/generated artifacts: Apache-2.0 WITH LLVM-exception. Redistribute
the accompanying [third-party notices](THIRD_PARTY_NOTICES.md) and `licenses/` files.

## Release maintenance

GitHub releases are idempotent: existing asset SHA-256 digests must match the tested
files. A matching published release is left intact; interrupted drafts receive only
missing assets before publication. Conflicting or incomplete published releases fail
without overwriting files, including when release immutability is enabled.

The upstream watcher checks the primary source library weekly. It makes only metadata
requests until a newer stable release is found; RC/nightly releases and downgrades
are rejected. Unchanged or previously attempted candidates do not start another build.
Run **Check upstream release** with `check_only: true` to inspect availability.

An update pins the release commit and fresh source hashes, reserves the next npm
compatibility line (minor for 0.x, major for 1.0+), and dispatches the normal publish
workflow on an isolated candidate branch. That workflow runs the complete existing
build/test/package gate before merging a PR, creating the version tag and publishing
the exact tested archive with npm OIDC/provenance. Source/schema or license changes
that fail CI stop publication. Apply compatibility fixes on main, then recreate the
single-commit pin/version candidate on that main and rerun its publish workflow.
If main advances, rebase and recheck the candidate. Toolchain pins (Emscripten, Rust,
Binaryen, wasm-bindgen and build helpers) remain independent of this library watcher.

No cross-repository webhook or persistent publisher token is required. GitHub may
disable scheduled workflows in inactive public repositories; re-enable the watcher
if GitHub notifies you of inactivity. Failed candidates remain available for diagnosis.
