import express from "express";
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
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

/**
 * Origens liberadas. Em produção defina CORS_ORIGIN no .env com a lista separada por
 * vírgula (ex.: "https://truco.seudominio.com.br"). Sem a variável, só o dev local passa.
 * Requisições sem Origin (curl, health check, app nativo) continuam permitidas — o CORS
 * do navegador não é a camada de autenticação; quem protege os dados é o requireAuth.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
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
  res.json({ status: "ok" });
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

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Truco do Novo API rodando em http://localhost:${PORT}`);
});
