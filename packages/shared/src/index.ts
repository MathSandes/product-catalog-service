import { z } from "zod";

export const PRODUCT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const QUEUE_NAME = "product-enrichment";

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export function reaisToCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("INVALID_PRICE");
  }
  return Math.round(value * 100);
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

const skuSchema = z
  .string()
  .min(1, "SKU obrigatório")
  .max(64)
  .transform(normalizeSku);

export const createProductBodySchema = z.object({
  sku: skuSchema,
  name: z.string().min(1).max(255),
  price: z.number().positive().max(1_000_000),
  categoryId: z.string().uuid(),
});

export const updateProductBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    price: z.number().positive().max(1_000_000).optional(),
    categoryId: z.string().uuid().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Informe ao menos um campo",
  });

export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
