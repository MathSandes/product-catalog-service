/**
 * Consome jobs da fila `product-enrichment` publicados pela API.
 * Novos jobs após edição de produto dependem da API fazer remove+add do mesmo jobId no BullMQ
 * (job concluído retém o id no Redis e um segundo add com o mesmo id não enfileiraria).
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@catalog/database";
import { QUEUE_NAME } from "@catalog/shared";
import {
  errorCodeFrom,
  processEnrichmentJob,
  sanitizeClientMessage,
} from "./enrichment";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(QUEUE_NAME, processEnrichmentJob, {
  connection,
  concurrency: 3,
});

worker.on("failed", async (job, err) => {
  if (!job?.data?.productId) return;
  const max = job.opts.attempts ?? 5;
  if (job.attemptsMade < max) return;

  await prisma.product.updateMany({
    where: { id: job.data.productId, status: { not: "PROCESSED" } },
    data: {
      status: "FAILED",
      errorCode: errorCodeFrom(err),
      errorMessage: sanitizeClientMessage(),
      lastAttemptAt: new Date(),
    },
  });
});

worker.on("completed", () => {
  /* noop — logs opcionais */
});

worker.on("error", (err) => {
  console.error("[worker]", err);
});

console.log(`Worker ouvindo fila "${QUEUE_NAME}"`);
