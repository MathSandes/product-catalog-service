import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSku, reaisToCents } from "./index.ts";

test("normalizeSku remove espaços e maiúsculas", () => {
  assert.equal(normalizeSku("  ab-c12  "), "AB-C12");
});

test("reaisToCents converte corretamente", () => {
  assert.equal(reaisToCents(10.5), 1050);
  assert.equal(reaisToCents(0.01), 1);
});

test("reaisToCents rejeita inválido", () => {
  assert.throws(() => reaisToCents(-1));
});
