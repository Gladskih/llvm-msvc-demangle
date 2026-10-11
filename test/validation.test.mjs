import assert from "node:assert/strict";
import { test } from "node:test";
import { validateInput } from "../dist/validation.js";

test("accepts symbol and RTTI names without interpreting their syntax", () => {
  assert.equal(validateInput("?f@@YAHH@Z"), null);
  assert.equal(validateInput(".?AVWidget@demo@@"), null);
  assert.equal(validateInput("invalid"), null);
});

test("reports malformed and excessive input without throwing", () => {
  assert.match(validateInput(null), /string/);
  assert.match(validateInput(1), /string/);
  assert.match(validateInput(""), /empty/);
  assert.match(validateInput("x".repeat(4097)), /4096/);
  assert.match(validateInput("a\0b"), /ASCII/);
  assert.match(validateInput("\u0080"), /ASCII/);
  assert.match(validateInput("\ud800"), /ASCII/);
  assert.match(validateInput("\n"), /ASCII/);
  assert.equal(validateInput("x".repeat(4096)), null);
  assert.equal(validateInput(" ~"), null);
});
