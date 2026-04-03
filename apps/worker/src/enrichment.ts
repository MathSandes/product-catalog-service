import type { Job } from "bullmq";
import { prisma } from "@catalog/database";
import { fetchWithTimeout } from "./http";

/** API pública simples, sem OAuth: um GET por produto. Total de itens no catálogo DummyJSON (2024). */
const DUMMYJSON_PRODUCTS = "https://dummyjson.com/products";
/** DummyJSON expõe 194 produtos com ids 1–194. */
export const DUMMYJSON_MAX_PRODUCT_ID = 194;

export function hashSkuToProductId(sku: string): number {
  let h = 0;
  for (let i = 0; i < sku.length; i++) {
    h = (h * 31 + sku.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % DUMMYJSON_MAX_PRODUCT_ID) + 1;
}

export function sanitizeClientMessage(): string {
  return "Falha ao enriquecer com a API externa. Tente novamente mais tarde.";
}

export function errorCodeFrom(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    return `HTTP_${(err as { status: number }).status}`;
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "TIMEOUT";
  }
  return "ENRICHMENT_ERROR";
}

type DummyJsonProduct = {
  id?: number;
  title?: string;
  description?: string;
  category?: string;
  thumbnail?: string;
  images?: string[];
  rating?: number;
};

async function fetchDummyJsonProduct(productId: number): Promise<DummyJsonProduct> {
  const res = await fetchWithTimeout(`${DUMMYJSON_PRODUCTS}/${productId}`, 20_000);
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP_${res.status}`), { status: res.status });
  }
  const data = (await res.json()) as DummyJsonProduct;
  if (!data || typeof data.title !== "string") {
    throw Object.assign(new Error("HTTP_INVALID_BODY"), { status: 502 });
  }
  return data;
}

export async function processEnrichmentJob(job: Job<{ productId: string }>) {
  const { productId } = job.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return;
  }

  const externalId = hashSkuToProductId(product.sku);

  await prisma.product.update({
    where: { id: productId },
    data: {
      status: "PROCESSING",
      lastAttemptAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  try {
    const data = await fetchDummyJsonProduct(externalId);
    const image =
      (Array.isArray(data.images) && typeof data.images[0] === "string"
        ? data.images[0]
        : null) ??
      (typeof data.thumbnail === "string" ? data.thumbnail : null);
    const rate = data.rating;

    await prisma.product.update({
      where: { id: productId },
      data: {
        status: "PROCESSED",
        enrichedTitle: data.title ?? null,
        enrichedDescription: typeof data.description === "string" ? data.description : null,
        enrichedImageUrl: image,
        enrichedExternalCategory:
          typeof data.category === "string" ? data.category : "dummyjson",
        enrichedRating: typeof rate === "number" && Number.isFinite(rate) ? rate : null,
        enrichedRatingCount: null,
        externalSourceId: typeof data.id === "number" ? data.id : externalId,
        externalSourceKey: null,
        errorCode: null,
        errorMessage: null,
        lastAttemptAt: new Date(),
      },
    });
  } catch (err: unknown) {
    await prisma.product.update({
      where: { id: productId },
      data: {
        errorCode: errorCodeFrom(err),
        errorMessage: sanitizeClientMessage(),
        lastAttemptAt: new Date(),
      },
    });

    throw err;
  }
}
