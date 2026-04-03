import type { FastifyInstance } from "fastify";
import { Prisma, prisma, ProductStatus } from "@catalog/database";
import {
  createProductBodySchema,
  normalizeSku,
  reaisToCents,
  updateProductBodySchema,
} from "@catalog/shared";
import { enqueueEnrichment } from "../queue";
import { z } from "zod";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "PROCESSED", "FAILED"]).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
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
  lastAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; slug: string };
};

function jobIdForProduct(productId: string) {
  return `enrich-${productId}`;
}

function serializeProduct(p: ProductRow) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.priceCents / 100,
    priceCents: p.priceCents,
    category: p.category,
    status: p.status,
    enrichedTitle: p.enrichedTitle,
    enrichedDescription: p.enrichedDescription,
    enrichedImageUrl: p.enrichedImageUrl,
    enrichedExternalCategory: p.enrichedExternalCategory,
    enrichedRating: p.enrichedRating,
    enrichedRatingCount: p.enrichedRatingCount,
    externalSourceId: p.externalSourceId,
    externalSourceKey: p.externalSourceKey,
    errorCode: p.errorCode,
    errorMessage: p.errorMessage,
    lastAttemptAt: p.lastAttemptAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const productTag = { tags: ["Products"] as const };

export async function productRoutes(app: FastifyInstance) {
  app.get("/products", {
    schema: { ...productTag, summary: "Lista produtos com filtros e paginação" },
  }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const where = {
      ...(q.status ? { status: q.status as ProductStatus } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" as const } },
              { sku: { contains: normalizeSku(q.search), mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { updatedAt: "desc" },
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
    ]);

    return {
      data: rows.map((p) => serializeProduct(p as ProductRow)),
      meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) },
    };
  });

  app.get("/products/:id", {
    schema: { ...productTag, summary: "Obtém produto por identificador" },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const p = await prisma.product.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!p) return reply.status(404).send({ error: "NOT_FOUND", message: "Produto não encontrado" });
    return { data: serializeProduct(p as ProductRow) };
  });

  app.post("/products", {
    schema: { ...productTag, summary: "Cria produto e enfileira enriquecimento" },
  }, async (request, reply) => {
    const body = createProductBodySchema.parse(request.body);
    const idempotencyKey = request.headers["idempotency-key"] as string | undefined;

    if (idempotencyKey) {
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing) {
        const product = await prisma.product.findUnique({
          where: { id: existing.productId },
          include: { category: { select: { id: true, name: true, slug: true } } },
        });
        if (product) {
          return reply.status(200).send({
            data: serializeProduct(product as ProductRow),
            idempotentReplay: true,
          });
        }
      }
    }

    const priceCents = reaisToCents(body.price);

    try {
      const product = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const cat = await tx.category.findUnique({ where: { id: body.categoryId } });
        if (!cat) {
          throw Object.assign(new Error("BAD_CATEGORY"), { code: "BAD_CATEGORY" });
        }

        const created = await tx.product.create({
          data: {
            sku: body.sku,
            name: body.name,
            priceCents,
            categoryId: body.categoryId,
            status: "PENDING",
          },
          include: { category: { select: { id: true, name: true, slug: true } } },
        });

        if (idempotencyKey) {
          await tx.idempotencyRecord.create({
            data: { key: idempotencyKey, productId: created.id },
          });
        }

        return created;
      });

      await enqueueEnrichment(product.id, jobIdForProduct(product.id));

      return reply.status(201).send({ data: serializeProduct(product as ProductRow) });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "BAD_CATEGORY") {
        return reply.status(400).send({ error: "VALIDATION", message: "Categoria inválida" });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.status(409).send({
          error: "DUPLICATE_SKU",
          message: "Já existe produto com este SKU",
        });
      }
      throw e;
    }
  });

  app.patch("/products/:id", {
    schema: { ...productTag, summary: "Atualiza produto e reenfileira quando aplicável" },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProductBodySchema.parse(request.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Produto não encontrado" });
    }

    const priceCents = body.price !== undefined ? reaisToCents(body.price) : undefined;

    if (body.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!cat) {
        return reply.status(400).send({ error: "VALIDATION", message: "Categoria inválida" });
      }
    }

    const needsReenrich =
      body.name !== undefined || body.price !== undefined || body.categoryId !== undefined;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(priceCents !== undefined ? { priceCents } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(needsReenrich
          ? {
              status: "PENDING" as ProductStatus,
              enrichedTitle: null,
              enrichedDescription: null,
              enrichedImageUrl: null,
              enrichedExternalCategory: null,
              enrichedRating: null,
              enrichedRatingCount: null,
              externalSourceId: null,
              externalSourceKey: null,
              errorCode: null,
              errorMessage: null,
              lastAttemptAt: null,
            }
          : {}),
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    if (needsReenrich) {
      await enqueueEnrichment(updated.id, jobIdForProduct(updated.id));
    }

    return { data: serializeProduct(updated as ProductRow) };
  });
}
