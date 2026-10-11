import { test, expect } from "@playwright/test";

test("browser loads only local assets and works under strict CSP", async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/test/browser.html");
  const result = await page.evaluate(async () => {
    const { createDemangler } = await import("/dist/browser.js");
    return (await createDemangler()).demangleType(".?AVWidget@demo@@");
  });
  expect(result.status).toBe("success");
  expect(result.ast.nodes[0].tag).toBe("Class");
  expect(requests.filter(url => url.endsWith(".wasm"))).toHaveLength(1);
  expect(requests.every(url => url.startsWith("http://127.0.0.1:4177/"))).toBe(true);
  expect(errors).toEqual([]);
});

test("provided bytes work after networking is disabled", async ({ page }) => {
  await page.goto("/test/browser.html");
  await page.evaluate(async () => {
    window.wasmBinary = new Uint8Array(await (await fetch("/dist/llvm-msvc-demangle.wasm"))
      .arrayBuffer());
    window.createDemangler = (await import("/dist/browser.js")).createDemangler;
  });
  await page.context().setOffline(true);
  const result = await page.evaluate(async () => (await window.createDemangler({
    wasmBinary: window.wasmBinary,
  })).demangleType(".?AV?$C@H@@"));
  expect(result.status).toBe("success");
  expect(result.ast.nodes.some(node => node.kind === "PrimitiveType")).toBe(true);
});

test("module workers can load and analyze RTTI names", async ({ page }) => {
  await page.goto("/test/browser.html");
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker("/test/worker.mjs", { type: "module" });
    worker.onerror = reject;
    worker.onmessage = event => {
      if (event.data === "ready") worker.postMessage(".?AUS@@");
      else { resolve(event.data); worker.terminate(); }
    };
  }));
  expect(result.status).toBe("success");
  expect(result.ast.nodes[0].tag).toBe("Struct");
});

test("long names and nested types parse without wrapper policy limits", async ({ page }) => {
  await page.goto("/test/browser.html");
  const results = await page.evaluate(async () => {
    const { createDemangler } = await import("/dist/browser.js");
    const api = await createDemangler();
    return [api.demangleType(`.${"PA".repeat(300)}H`).status,
      api.demangleType(`.?AV${"L".repeat(2 * 1024 * 1024)}@@`).status,
      api.demangle("?x@@3HA").status];
  });
  expect(results).toEqual(["success", "success", "success"]);
});

test("native formatting works offline under CSP and agrees with analysis", async ({ page }) => {
  await page.goto("/test/browser.html");
  await page.evaluate(async () => {
    window.wasmBinary = new Uint8Array(await (await fetch("/dist/llvm-msvc-demangle.wasm"))
      .arrayBuffer());
    window.createDemangler = (await import("/dist/browser.js")).createDemangler;
  });
  await page.context().setOffline(true);
  const results = await page.evaluate(async () => {
    const api = await window.createDemangler({ wasmBinary: window.wasmBinary });
    return { symbol: api.demangleWithText("?f@@YAHH@Z"),
      type: api.demangleTypeWithText(".?AVWidget@demo@@"),
      analysis: api.demangleType(".?AVWidget@demo@@"),
      invalid: api.demangleWithText("?") };
  });
  expect(results.symbol.text).toBe("int __cdecl f(int)");
  expect(results.type.text).toBe("class demo::Widget");
  expect(results.type.ast).toEqual(results.analysis.ast);
  expect(results.analysis).not.toHaveProperty("text");
  expect(results.invalid.text).toBeNull();
});
