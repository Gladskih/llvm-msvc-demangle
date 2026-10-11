# Contributing

Keep the demangler local, memory-safe, dependency-free for consumers, and faithful to
the pinned upstream AST. Consult LLVM source/tests before changing format behavior.
Never infer AST fields by parsing printed demangled text.

Use small cohesive modules, double-quoted JavaScript strings, const by default,
descriptive names, functions generally under 30 lines (never over 50), and complexity
below 10. Aim for 100-column lines. Avoid boolean control parameters, single-use
constants, generic helper modules, redundant result fields, and repeated parsing.
The analyzer returns plain objects and warnings. Keep native presentation opt-in through
separate methods; the analysis methods must not invoke the presentation formatter.
Use imperative, present-tense commit messages.

Bounds-check lengths and pointers before reads. Malformed/truncated names must
produce diagnostics. Preserve 64-bit values exactly. Keep upstream pins immutable;
generated safety patches must fail if upstream insertion points change. Preserve licenses.
Do not impose arbitrary caps on input length, parser work/depth, allocations, AST or output.
Check against actual buffer bounds and address-space arithmetic instead.
Document any new input/resource restriction and any LLVM AST/schema changes.

For each public behavior, test the successful path and meaningful failure/boundary
cases. Make tests fail for the intended missing behavior before implementing it.
Keep tests flat. Encode independent expected values with upstream source references;
do not use the production constants as the test oracle. Mutation tests should expose
weak assertions. JS coverage must remain at 100% for lines, branches, and functions.

Before reporting success or releasing:

```sh
npm ci
npm run build:wasm
npm run test:native
npm run test:differential
npx playwright install --with-deps chromium
npm run verify
npm run pack:verified
```

Audit the final changes against these rules explicitly. CI must pass, including
Linux/Windows consumer tests on the exact tarball. Publish only that tested artifact.
Use npm Trusted Publishing with provenance for automated tag releases, never a
long-lived npm token. Do not edit or republish existing registry versions.
