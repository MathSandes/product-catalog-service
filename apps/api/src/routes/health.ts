import type { FastifyInstance } from "fastify";
import { readFileSync } from "fs";
import { join } from "path";
import IORedis from "ioredis";
import { prisma } from "@catalog/database";
import { enrichmentQueue } from "../queue";

function apiPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Consulta de saúde da API",
    },
  }, async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    try {
      const redis = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      await redis.ping();
      redis.disconnect();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    let queue: Record<string, number> | undefined;
    try {
      if (checks.redis === "ok") {
        const counts = await enrichmentQueue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed"
        );
        queue = {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }
    } catch {
      checks.queue = "error";
    }

    const ok = checks.database === "ok" && checks.redis === "ok";
    return reply.status(ok ? 200 : 503).send({
      status: ok ? "ok" : "degraded",
      checks,
      service: "catalog-api",
      version: apiPackageVersion(),
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? "development",
      ...(queue ? { queue } : {}),
    });
  });
}
