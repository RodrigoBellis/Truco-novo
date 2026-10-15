import { defineConfig, devices } from "@playwright/test";

/**
 * O mesmo roteiro completo do ensaio (e2e/rehearsal.spec.ts), pelos botões reais, contra o
 * backend em MODO HOMOLOGAÇÃO: repositório e RPCs reais sobre o PostgreSQL LOCAL descartável,
 * com contas e dados fictícios. Nada fala com o Supabase.
 *
 * Antes: node backend/scripts/homologacao-local.mjs up
 * Rodar: npm run test:homologacao -- --project=chromium
 *        npm run test:homologacao -- --project=mobile-chromium
 * Não rodar junto com test:rehearsal: os dois usam as portas 3101 e 5183.
 */
const FRONTEND = "http://127.0.0.1:5183";
const BACKEND = "http://localhost:3101";

export default defineConfig({
  metadata: { rehearsal: true, homologation: true },
  testDir: "./e2e",
  testMatch: ["rehearsal.spec.ts", "senha-fixa.spec.ts"],
  outputDir: "test-results/homologacao",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: FRONTEND,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "npm run dev:homologacao --workspace backend",
      url: BACKEND + "/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev --workspace frontend -- --host 127.0.0.1 --port 5183 --strictPort",
      url: FRONTEND,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_URL: BACKEND + "/api",
        VITE_SUPABASE_URL: BACKEND,
        VITE_SUPABASE_PUBLISHABLE_KEY: "chave-publica-de-homologacao",
      },
    },
  ],
});
