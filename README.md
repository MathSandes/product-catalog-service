# Catálogo de Itens — Desafio Técnico

Cenário escolhido: **Catálogo de Itens** (Cenário 3 do desafio técnico).

Monorepo: **API HTTP (Node/Fastify)** e **Worker** separados; processamento assíncrono com **BullMQ + Redis**; **PostgreSQL (Prisma)**; **React (Vite)**; enriquecimento com uma única chamada à **[DummyJSON Products](https://dummyjson.com/docs/products)** (`GET /products/{id}`, sem OAuth); **Docker Compose** com healthchecks; imagens **Node bookworm-slim** com **OpenSSL**; Prisma com `binaryTargets` **`debian-openssl-3.0.x`**.

### Integração externa — DummyJSON

Fluxo enxuto: o worker deriva um **id numérico 1–194** a partir do **SKU** (hash estável), chama **`https://dummyjson.com/products/{id}`** com timeout, mapeia **título, descrição, imagem, categoria textual e rating** para os campos enriquecidos e define **PROCESSED**. Em erro de rede ou HTTP, o **BullMQ** retenta com backoff exponencial; após esgotar tentativas, o produto fica **FAILED**. A categoria interna do cadastro (FK) não muda; `enrichedExternalCategory` vem da API externa.

**Por que o enriquecido pode “não bater” com a categoria do cadastro?** O mapeamento usa só o **SKU** para escolher um produto válido no catálogo fictício do DummyJSON — isso mantém a demo **previsível** e o fluxo **determinístico**. O desafio não exige alinhamento semântico entre categoria interna e categoria da API mock. Em produção, faria sentido um **mapeamento** categoria interna ↔ slug/categoria da fonte externa (ou busca por nome) para aproximar o significado de negócio.

### Segurança na API (camada básica)

- **Validação de entrada** com **Zod** nos payloads de produto.
- **Rate limiting** (`@fastify/rate-limit`): 100 req/min nas rotas de negócio; **`allowList`** isenta **`/health`**, **`/documentation`** e **`/docs*`** (monitoramento e Swagger sem consumir cota).
- **Headers** com **@fastify/helmet** (`contentSecurityPolicy` desligado para API JSON). Em produção: HTTPS, store distribuído para rate limit ou **API Gateway**.

## Como executar (avaliador)

- Pré-requisitos: **Docker** e **Docker Compose** recentes.
- Na pasta deste repositório (onde está `docker-compose.yml`):

```bash
docker compose up --build
```

- Aguarde os healthchecks de **postgres** e **redis**; a API aplica **migrations** ao subir.
- **Interface:** http://localhost:8080 (Nginx serve o front e faz proxy de `/api` para a API).
- **API direta (recomendada para docs e health):** http://localhost:3000 — ex.: `GET http://localhost:3000/health`
- **Swagger / OpenAPI 3:** use **somente** http://localhost:3000/documentation (JSON: http://localhost:3000/documentation/json). O Swagger UI referencia arquivos em `/documentation/...` na mesma origem; pelo **Nginx na 8080** só o prefixo `/api/` é repassado à API, então **`http://localhost:8080/api/documentation` não funciona** (página em branco). **`http://localhost:8080/documentation`** é o **front** (fallback do SPA), não o Swagger.

**Portas no computador do avaliador (host):** o Postgres e o Redis **não** usam 5432/6379 no host, para **não colidir** com instalações locais comuns. Entre containers, a API e o worker continuam usando `postgres:5432` e `redis:6379` (rede interna do Compose).

| Serviço    | URL / porta no host (opcional, ex.: DBeaver, redis-cli) |
| ---------- | -------------------------------------------------------- |
| PostgreSQL | `localhost:15432` (usuário `catalog`, senha `catalog`, DB `catalog`) |
| Redis      | `localhost:16379`                                        |
| Front      | http://localhost:8080                                     |
| API        | http://localhost:3000                                     |
| Swagger UI | http://localhost:3000/documentation (não use a porta 8080 para o Swagger) |

**PostgreSQL e Redis não são serviços HTTP:** não abrem página no navegador em `localhost:15432` ou `localhost:16379`. Use um **cliente SQL** (DBeaver, pgAdmin, `psql`, etc.) para o Postgres e **`redis-cli -h 127.0.0.1 -p 16379`** (ou GUI) para o Redis.

**Raiz da API (`GET /`):** não há rota registrada em `/` — o navegador pode mostrar 404; isso é esperado. Para testar a API direta, use **`/health`**, **`/documentation`** ou as rotas de negócio (**`/products`**, **`/categories`**).

Variáveis: copie [`.env.example`](.env.example) para `.env` apenas se for rodar **API/worker no host** enquanto sobe só DB/fila pelo Compose — as URLs de exemplo já usam **15432** e **16379** para bater com este `docker-compose.yml`.

---

## Parte 1 — Respostas objetivas (máx. 10 linhas cada)

### 1. Integração resiliente

Cliente HTTP com **timeout**; respeitar limites da API externa; **fila** com retentativas e **backoff exponencial**; falhas definitivas após teto de tentativas; degradar com estado persistido em vez de derrubar o sistema; **observabilidade** com logs e métricas para entender falhas e comportamento da integração.

### 2. Refinamento de requisito

Entender problema e usuário; levantar dúvidas e cenários (feliz e bordas); **MVP** vs fora de escopo; **critérios de aceite** testáveis; modelo de dados e integrações; riscos; **especificação única** alinhada com negócio antes de desenvolver.

### 3. Idempotência

**Idempotency-Key** no cliente quando aplicável; persistir resultado da primeira execução e devolver o mesmo em retentativas; **constraint única** no banco (ex.: SKU, chave de idempotência) como rede de segurança contra duplicidade.

### 4. Síncrono vs. assíncrono

**Síncrono** quando a resposta precisa refletir o resultado imediatamente (**consistência imediata**) e o trabalho é rápido. **Assíncrono** (fila) para trabalho pesado ou integrações instáveis, aceitando **consistência eventual** até o processamento concluir.

### 5. Segurança (API pública)

**HTTPS** em produção; autenticação/autorização quando necessário; **validação de entrada**; **rate limiting** e proteção a abuso (incl. **IP throttling**); CORS restrito quando possível; segredos em variáveis de ambiente; logs sem dados sensíveis.

### 6. Qualidade e Entrega

**Qualidade:** critérios objetivos, validação e testes nas partes críticas. **Entrega:** o menor conjunto que gera valor com risco controlado. **Débito técnico** são atalhos conscientes e documentados. **Melhorias futuras** não bloqueiam o primeiro release, mas aumentam robustez ou escala.

### 7. Governança e IA

IA para acelerar boilerplate e revisão, com **revisão humana** obrigatória; não enviar **segredos nem dados sensíveis** a modelos externos sem política; manter **lint, testes e PR** como barreira de qualidade.

### Por que usar fila?

Desacopla o processamento pesado da requisição HTTP, **reduz latência** para o usuário, aumenta **resiliência** a falhas externas e permite **escalar workers** independentemente da API.

### Decisões de stack (exemplo)

**BullMQ + Redis** atendem bem Node.js, desenvolvimento local simples e um único `docker compose up`. **RabbitMQ** seria alternativa forte em ecossistemas multi-linguagem e roteamento avançado; aqui o custo operacional extra não se justifica.

### Trade-offs

**Polling** no front em vez de WebSocket/SSE por simplicidade no MVP; com alta frequência de mudanças de status, evoluir para **SSE** ou **WebSockets**. A interface utiliza **polling condicional** via **TanStack React Query** enquanto existem itens em **PENDING** ou **PROCESSING**, refletindo automaticamente a mudança para **PROCESSED** ou **FAILED** sem necessidade de refresh manual (atende o requisito de **UX assíncrona** do edital).

### Decisões técnicas e trade-offs (resumo)

- **API e worker separados** com **BullMQ + Redis**: a HTTP responde rápido; integração externa falha e retenta sem travar o usuário. *Trade-off:* mais componentes para subir localmente (mitigado com um único `docker compose up`).
- **Job estável `enrich-{productId}`**: a API remove o job anterior no Redis antes de cada novo `add` — o BullMQ não enfileira de novo com o mesmo `jobId` se o anterior ainda existir (ex.: `completed`). Assim o **worker** volta a receber jobs após **PATCH**. *Trade-off:* lógica na API em troca de reenfileiramento confiável.
- **DummyJSON + hash do SKU**: demo **determinística** e simples (um GET, sem OAuth). *Trade-off:* enriquecido pode não refletir semanticamente a categoria interna (documentado acima).
- **Fastify + Prisma + Zod**: performance e tipagem na API, persistência relacional, validação uniforme nos payloads.
- **React + Vite + TanStack Query**: SPA leve; *trade-off:* **polling** em vez de SSE/WebSocket (simplicidade do MVP; ver “Melhorias…”).
- **BullMQ vs RabbitMQ**: escolha pela simplicidade em Node e um broker só (Redis). *Trade-off:* menos recursos de roteamento que filas “enterprise”.
- **Monorepo (`packages/shared`, `packages/database`)**: uma fonte de verdade para schemas e cliente Prisma; *trade-off:* build ordenado entre pacotes.

### Melhorias com mais tempo e escala (~1M de acessos)

Com mais tempo: **SSE ou WebSocket** para status em tempo real; **OpenAPI** com schemas por rota; **`metadata` JSONB** para enriquecimentos variados; testes de integração (API + fila) e **CI** com lint + testes. Em alto tráfego: **réplicas** da API atrás de load balancer, **read replicas** ou cache (Redis) em listagens quentes, **vários workers** com particionamento da fila, rate limit e **WAF/API Gateway**, **observabilidade** (tracing, métricas, alertas), pool e índices no Postgres revisados, e fila com **dead-letter** e políticas de backoff por tipo de erro.

### Demonstração em vídeo

Vídeo curto demonstrando o funcionamento do sistema (Docker, API, fila e front):

https://drive.google.com/file/d/1gkAnYJGSmpOxErf21Uf6PINRUtXKIamU/view?usp=drive_link

---

## Arquitetura (resumo)

- **API × Worker:** a separação permite que a **requisição HTTP responda rapidamente** ao usuário (dados gravados, **PENDING**) enquanto o processamento mais pesado (**integração externa**) ocorre de forma **assíncrona** na fila — desenho orientado à **experiência do usuário** sob consistência eventual.
- **POST/PATCH** de produto grava no Postgres com **PENDING** (quando aplicável) e enfileira job com id **`enrich-{productId}`**. Antes do `add`, a API chama **`remove` desse `jobId` no BullMQ**, pois jobs já finalizados mantêm o id no Redis e um segundo `add` com o mesmo id **não enfileiraria** de novo (necessário após edição que reprocessa o enriquecimento). O **worker** consome esses jobs, chama DummyJSON e atualiza o banco.
- **Worker:** **PROCESSING** → `GET https://dummyjson.com/products/{id}` (id estável a partir do SKU) → persiste campos enriquecidos → **PROCESSED**; se a API falhar até o fim das retentativas da fila → **FAILED** (evento `failed` do BullMQ após esgotar tentativas).
- **Front (React):** filtros por status, categoria e busca; a listagem usa **paginação no backend** (`page`, `limit`, totais em `meta`) para manter eficiência mesmo com volumes maiores.
- **API:** `GET /health` (versão, uptime, ambiente, checagens, fila). **Swagger UI** em **`/documentation`**.

---

## Desenvolvimento local (sem Docker)

```bash
npm install
# Subir Postgres e Redis (ou use Docker só para eles)
npm run db:generate
npm run db:migrate
# Terminal 1: API — npm run dev -w @catalog/api
# Terminal 2: Worker — npm run dev -w @catalog/worker  
# Terminal 3: Front — npm run dev -w @catalog/web (proxy /api -> localhost:3000)
```

Configure `DATABASE_URL`, `REDIS_URL` e `VITE_API_URL` conforme [.env.example](.env.example).

---

## Testes

```bash
npm test
```

Fluxos cobertos: normalização de SKU/preço, hash do id DummyJSON (1–194), padrão do `jobId` da fila (`enrich-{productId}`). A **idempotência de criação** via header **Idempotency-Key** está na API e na Parte 1; não há suíte E2E automatizada da API + fila neste repositório.
