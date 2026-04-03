import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAME } from "@catalog/shared";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const enrichmentQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export async function enqueueEnrichment(
  productId: string,
  jobId: string
): Promise<void> {
  // BullMQ não adiciona job se o jobId já existe (ex.: completed) — liberar antes de reenfileirar (PATCH).
  await enrichmentQueue.remove(jobId);
  await enrichmentQueue.add(
    "enrich",
    { productId },
    {
      jobId,
    }
  );
}
