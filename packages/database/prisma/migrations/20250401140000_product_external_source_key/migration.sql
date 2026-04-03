-- Identificador textual de itens em APIs externas (ex.: id MLB123 do Mercado Livre).
ALTER TABLE "Product" ADD COLUMN "externalSourceKey" TEXT;
