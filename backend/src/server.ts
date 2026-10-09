import { createApp } from "./app.js";
import { isRehearsalMode } from "./utils/rehearsalMode.js";
import { isHomologationMode } from "./utils/homologationMode.js";
import { startKnockoutRecovery } from "./services/bracketService.js";

const homologation = !isRehearsalMode() && isHomologationMode();
// As rotas de apoio da homologação (e o driver SQL) só são carregadas nesse modo.
const app = createApp(homologation ? (await import("./routes/homologationRoutes.js")).mountHomologationRoutes : undefined);
const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  startKnockoutRecovery();
  console.log(`Truco do Novo API rodando em http://localhost:${PORT}${isRehearsalMode() ? " — MODO ENSAIO (dados fictícios em memória, sem Supabase)" : homologation ? " — MODO HOMOLOGAÇÃO (PostgreSQL local, contas fictícias, sem Supabase)" : ""}`);
});
