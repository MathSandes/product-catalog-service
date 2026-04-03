import { buildApp } from "./app";

const port = Number(process.env.API_PORT ?? 3000);
const host = "0.0.0.0";

buildApp()
  .then((app) =>
    app.listen({ port, host }).then(() => {
      app.log.info(`API escutando em http://${host}:${port}`);
    })
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
