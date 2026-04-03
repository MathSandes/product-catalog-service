const raw = import.meta.env.VITE_API_URL;

/** Base da API no browser: env em build ou proxy /api em dev */
export const API_BASE = (raw && raw.length > 0 ? raw.replace(/\/$/, "") : "/api") as string;

export type ProductStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";

export type Category = { id: string; name: string; slug: string };

export type Product = {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: Category;
  status: ProductStatus;
  enrichedTitle: string | null;
  enrichedDescription: string | null;
  enrichedImageUrl: string | null;
  enrichedExternalCategory: string | null;
  enrichedRating: number | null;
  enrichedRatingCount: number | null;
  externalSourceId: number | null;
  externalSourceKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  updatedAt: string;
};

export async function fetchCategories(): Promise<Category[]> {
  const r = await fetch(`${API_BASE}/categories`);
  if (!r.ok) throw new Error("Falha ao carregar categorias");
  const j = (await r.json()) as { data: Category[] };
  return j.data;
}

export type ListParams = {
  page: number;
  limit: number;
  status?: ProductStatus;
  categoryId?: string;
  search?: string;
};

export async function fetchProducts(params: ListParams) {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));
  sp.set("limit", String(params.limit));
  if (params.status) sp.set("status", params.status);
  if (params.categoryId) sp.set("categoryId", params.categoryId);
  if (params.search) sp.set("search", params.search);
  const r = await fetch(`${API_BASE}/products?${sp.toString()}`);
  if (!r.ok) throw new Error("Falha ao listar produtos");
  return r.json() as Promise<{
    data: Product[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>;
}

export async function createProduct(body: {
  sku: string;
  name: string;
  price: number;
  categoryId: string;
}) {
  const r = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error((j as { message?: string }).message ?? "Erro ao criar");
  }
  return j as { data: Product };
}

export async function updateProduct(
  id: string,
  body: { name?: string; price?: number; categoryId?: string }
) {
  const r = await fetch(`${API_BASE}/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error((j as { message?: string }).message ?? "Erro ao atualizar");
  }
  return j as { data: Product };
}
