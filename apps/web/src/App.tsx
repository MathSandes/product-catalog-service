import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  API_BASE,
  createProduct,
  fetchCategories,
  fetchProducts,
  updateProduct,
  type Product,
  type ProductStatus,
} from "./api";

function needsPolling(list: Product[] | undefined) {
  if (!list?.length) return false;
  return list.some((p) => p.status === "PENDING" || p.status === "PROCESSING");
}

function statusLabel(s: ProductStatus): string {
  switch (s) {
    case "PENDING":
      return "Pendente";
    case "PROCESSING":
      return "Processando";
    case "PROCESSED":
      return "Processado";
    case "FAILED":
      return "Falhou";
    default:
      return s;
  }
}

export default function App() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [formCategory, setFormCategory] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSku, setEditSku] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const createFeedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const productsQ = useQuery({
    queryKey: ["products", page, status, categoryId, search],
    queryFn: () =>
      fetchProducts({
        page,
        limit: 15,
        ...(status ? { status } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    refetchInterval: (q) =>
      needsPolling(q.state.data?.data) ? 2500 : false,
  });

  const createM = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      setSku("");
      setName("");
      setPrice("");
      if (createFeedbackRef.current) clearTimeout(createFeedbackRef.current);
      setCreateFeedback("Produto cadastrado. Enriquecimento em andamento.");
      createFeedbackRef.current = setTimeout(() => {
        setCreateFeedback(null);
        createFeedbackRef.current = null;
      }, 7000);
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const updateM = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name: string; price: number; categoryId: string };
    }) => updateProduct(id, body),
    onSuccess: () => {
      setEditingId(null);
      setEditSku("");
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditSku(p.sku);
    setEditName(p.name);
    setEditPrice(p.price.toFixed(2).replace(".", ","));
    setEditCategoryId(p.category.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSku("");
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const p = parseFloat(editPrice.replace(",", "."));
    if (!Number.isFinite(p) || p <= 0) return;
    updateM.mutate({
      id: editingId,
      body: {
        name: editName,
        price: p,
        categoryId: editCategoryId,
      },
    });
  };

  const firstCategory = categoriesQ.data?.[0]?.id;

  useEffect(() => {
    if (categoriesQ.data?.length && !formCategory) {
      setFormCategory(categoriesQ.data[0].id);
    }
  }, [categoriesQ.data, formCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(price.replace(",", "."));
    if (!Number.isFinite(p) || p <= 0) {
      return;
    }
    createM.mutate({
      sku,
      name,
      price: p,
      categoryId: formCategory || firstCategory || "",
    });
  };

  const meta = productsQ.data?.meta;
  const rows = productsQ.data?.data ?? [];
  const pollingActive = needsPolling(rows);

  useEffect(() => {
    return () => {
      if (createFeedbackRef.current) clearTimeout(createFeedbackRef.current);
    };
  }, []);

  return (
    <div className="layout">
      <h1>Catálogo de Itens</h1>
      <p className="muted">
        Cadastre produtos e acompanhe o enriquecimento automático dos dados. A lista atualiza
        sozinha até o processamento concluir.
      </p>
      <p className="hint">
        Fonte de dados de demonstração:{" "}
        <a href="https://dummyjson.com/docs/products" target="_blank" rel="noreferrer">
          DummyJSON
        </a>
        . API do front: <code>{API_BASE}</code>
      </p>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Novo produto</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>SKU</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: ABC-001"
                required
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>Preço (R$)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="99.90"
                inputMode="decimal"
                required
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>Categoria</label>
              <select
                value={formCategory || firstCategory || ""}
                onChange={(e) => setFormCategory(e.target.value)}
                required
                disabled={!categoriesQ.data?.length}
              >
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {createFeedback && (
              <p className="success" role="status" aria-live="polite">
                {createFeedback}
              </p>
            )}
            {createM.isError && (
              <p className="error">
                {(createM.error as Error).message}
              </p>
            )}
            <button type="submit" disabled={createM.isPending}>
              {createM.isPending ? "Salvando…" : "Cadastrar"}
            </button>
          </form>

          {editingId && (
            <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #e5e7eb" }}>
              <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Editar produto</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                SKU não pode ser alterado. Alterações reenfileiram o enriquecimento.
              </p>
              <form onSubmit={handleEditSubmit}>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label>SKU</label>
                  <input value={editSku} disabled readOnly />
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label>Nome</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label>Preço (R$)</label>
                  <input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label>Categoria</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    required
                  >
                    {(categoriesQ.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {updateM.isError && (
                  <p className="error">{(updateM.error as Error).message}</p>
                )}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button type="submit" disabled={updateM.isPending}>
                    {updateM.isPending ? "Salvando…" : "Salvar alterações"}
                  </button>
                  <button type="button" className="secondary" onClick={cancelEdit}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "0.25rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Lista</h2>
            {pollingActive && (
              <span className="live-indicator" aria-live="polite">
                Atualizando status dos produtos…
              </span>
            )}
          </div>
          <p className="hint" style={{ marginBottom: "0.75rem" }}>
            Dados enriquecidos vêm de uma API pública de demonstração e podem não corresponder
            exatamente ao produto cadastrado.
          </p>
          <div className="filters">
            <div>
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value as ProductStatus | "");
                }}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="PROCESSING">Processando</option>
                <option value="PROCESSED">Processado</option>
                <option value="FAILED">Falhou</option>
              </select>
            </div>
            <div>
              <label>Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setPage(1);
                  setCategoryId(e.target.value);
                }}
              >
                <option value="">Todas</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 200px" }}>
              <label>Nome ou SKU</label>
              <input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Buscar…"
              />
            </div>
          </div>

          {productsQ.isLoading && (
            <p className="muted" aria-busy="true">
              Carregando produtos…
            </p>
          )}
          {productsQ.isError && (
            <p className="error">{(productsQ.error as Error).message}</p>
          )}

          {!productsQ.isLoading && !productsQ.isError && (
            <>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Nome</th>
                      <th>Preço</th>
                      <th>Status</th>
                      <th>Enriquecido (demo)</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code>{p.sku}</code>
                        </td>
                        <td>{p.name}</td>
                        <td>
                          {p.price.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </td>
                        <td>
                          <span className={`badge ${p.status}`}>{statusLabel(p.status)}</span>
                        </td>
                        <td className={p.enrichedTitle ? "enriched-cell" : undefined}>
                          {p.enrichedTitle ? (
                            <div>
                              <div title={p.enrichedDescription ?? ""}>{p.enrichedTitle}</div>
                              {p.enrichedExternalCategory && (
                                <div className="muted" style={{ fontSize: "0.8rem" }}>
                                  Cat. API: {p.enrichedExternalCategory}
                                </div>
                              )}
                              {p.enrichedRating != null && (
                                <div className="muted" style={{ fontSize: "0.8rem" }}>
                                  ★ {p.enrichedRating.toFixed(1)}
                                  {p.enrichedRatingCount != null
                                    ? ` (${p.enrichedRatingCount})`
                                    : ""}
                                </div>
                              )}
                            </div>
                          ) : p.status === "FAILED" && p.errorMessage ? (
                            <span className="muted" title={p.errorCode ?? ""}>
                              {p.errorMessage}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="link"
                            onClick={() => startEdit(p)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {meta && meta.total > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: "0.75rem",
                  }}
                >
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="muted">
                    Página {meta.page} de {meta.totalPages} (
                    {meta.total} {meta.total === 1 ? "item" : "itens"})
                  </span>
                  <button
                    type="button"
                    disabled={page >= meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
