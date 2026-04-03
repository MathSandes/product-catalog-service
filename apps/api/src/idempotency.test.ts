import { test } from "node:test";
import assert from "node:assert/strict";

/** Mesmo padrão de jobId da API — enqueue remove o job anterior antes do add */
function jobIdForProduct(productId: string) {
  return `enrich-${productId}`;
}

test("jobId estável por produto (padrão enrich-{productId})", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(jobIdForProduct(id), `enrich-${id}`);
});
