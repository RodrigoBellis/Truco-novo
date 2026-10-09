import express, { type Express } from "express";
import cors from "cors";
import { authRoutes } from "./routes/authRoutes.js";
import { playersRoutes } from "./routes/playersRoutes.js";
import { teamsRoutes } from "./routes/teamsRoutes.js";
import { groupsRoutes } from "./routes/groupsRoutes.js";
import { matchesRoutes } from "./routes/matchesRoutes.js";
import { bracketRoutes } from "./routes/bracketRoutes.js";
import { rankingRoutes } from "./routes/rankingRoutes.js";
import { historyRoutes } from "./routes/historyRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { simulationRoutes } from "./routes/simulationRoutes.js";
import { scheduleRoutes } from "./routes/scheduleRoutes.js";
import { rehearsalRoutes, rehearsalSupabaseRoutes } from "./routes/rehearsalRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { isRehearsalMode } from "./utils/rehearsalMode.js";
import { isHomologationMode } from "./utils/homologationMode.js";

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Monta a API. server.ts só escuta a porta; os testes de integração usam a app direto. */
/** Rotas extras de um modo de teste, montadas antes do tratador de erros. */
export type MountExtraRoutes = (app: Express) => void;

export function createApp(mountExtraRoutes?: MountExtraRoutes): Express {
  const app = express();
  const rehearsal = isRehearsalMode();
  const homologation = !rehearsal && isHomologationMode();

  /**
   * Origens liberadas. Em produção defina CORS_ORIGIN no .env com a lista separada por
   * vírgula (ex.: "https://truco.seudominio.com.br"). Sem a variável, só o dev local passa.
   * Requisições sem Origin (curl, health check, app nativo) continuam permitidas — o CORS
   * do navegador não é a camada de autenticação; quem protege os dados é o requireAuth.
   * Nos modos ensaio e homologação (nunca em produção) qualquer porta local é aceita.
   */
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || ((rehearsal || homologation) && LOCAL_ORIGIN.test(origin))) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "3mb" }));

  app.get("/api/health", (_req, res) => {
    res.json(rehearsal ? { status: "ok", rehearsal: true } : homologation ? { status: "ok", homologation: true } : { status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/players", playersRoutes);
  app.use("/api/teams", teamsRoutes);
  app.use("/api/groups", groupsRoutes);
  app.use("/api/matches", matchesRoutes);
  app.use("/api/bracket", bracketRoutes);
  app.use("/api/ranking", rankingRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/simulation", simulationRoutes);
  app.use("/api/schedule", scheduleRoutes);

  if (rehearsal) {
    app.use("/api/rehearsal", rehearsalRoutes);
    app.use(rehearsalSupabaseRoutes);
  }
  mountExtraRoutes?.(app);

  app.use(errorHandler);
  return app;
}
