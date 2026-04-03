import { test } from "node:test";
import assert from "node:assert/strict";
import { DUMMYJSON_MAX_PRODUCT_ID, hashSkuToProductId } from "./enrichment.ts";

test("hashSkuToProductId retorna id válido para DummyJSON (1..N)", () => {
  for (let i = 0; i < 50; i++) {
    const n = hashSkuToProductId(`SKU-${i}`);
    assert.ok(n >= 1 && n <= DUMMYJSON_MAX_PRODUCT_ID);
  }
});
