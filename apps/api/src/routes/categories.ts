import type { FastifyInstance } from "fastify";
import { prisma } from "@catalog/database";

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/categories", {
    schema: {
      tags: ["Categories"],
      summary: "Lista categorias internas",
    },
  }, async () => {
    const rows = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    return { data: rows };
  });
}
