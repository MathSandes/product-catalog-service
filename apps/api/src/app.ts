import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health";
import { categoryRoutes } from "./routes/categories";
import { productRoutes } from "./routes/products";

function skipRateLimit(url: string): boolean {
  const p = url.split("?")[0];
  return (
    p === "/health" ||
    p.startsWith("/documentation") ||
    p === "/docs" ||
    p.startsWith("/docs/")
  );
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Catálogo de Itens API",
        description:
          "API do desafio técnico (cenário 3 — catálogo). Permite cadastro, listagem com filtros e paginação e edição de produtos, além da listagem de categorias internas. O enriquecimento via DummyJSON é assíncrono (worker e fila BullMQ). Use GET /health para versão, ambiente, checagens e métricas da fila. Documentação interativa em /documentation (porta 3000).",
        version: "1.0.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local — container da API (porta 3000 exposta no host pelo Docker)",
        },
      ],
      tags: [
        {
          name: "Health",
          description:
            "Disponibilidade do serviço, PostgreSQL, Redis e contagem da fila de enriquecimento.",
        },
        {
          name: "Categories",
          description: "Categorias internas utilizadas no cadastro de produtos.",
        },
        {
          name: "Products",
          description:
            "Produtos do catálogo: criação, consulta, atualização, filtros, paginação e enfileiramento de enriquecimento.",
        },
      ],
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header("Access-Control-Allow-Origin", origin ?? "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: (req) => skipRateLimit(req.url),
  });

  await app.register(healthRoutes);
  await app.register(categoryRoutes);
  await app.register(productRoutes);

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  app.setErrorHandler((err: Error & { validation?: unknown }, _request, reply) => {
    if ("validation" in err && err.validation) {
      return reply.status(400).send({
        error: "VALIDATION",
        message: err.message,
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION",
        message: "Dados inválidos",
        details: err.flatten(),
      });
    }
    app.log.error(err);
    return reply.status(500).send({
      error: "INTERNAL",
      message: "Erro interno",
    });
  });

  return app;
}
