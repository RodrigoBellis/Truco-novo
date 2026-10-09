import { defineConfig, devices } from "@playwright/test";

/**
 * Simulação completa pelo navegador contra o backend em MODO ENSAIO (dados fictícios em
 * memória, sem Supabase). Não usa os servidores de desenvolvimento (5173/3001): sobe um
 * backend de ensaio em 3101 e um segundo frontend em 5183 apontado para ele.
 *
 * Rodar: npm run test:rehearsal            (os dois projetos, um depois do outro)
 *        npm run test:rehearsal -- --project=chromium
 */
const FRONTEND = "http://127.0.0.1:5183";
const BACKEND = "http://localhost:3101";

export default defineConfig({
  metadata: { rehearsal: true },
  testDir: "./e2e",
  testMatch: "rehearsal.spec.ts",
  outputDir: "test-results/rehearsal",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 10_000 },
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
      command: "npm run dev:rehearsal --workspace backend",
      url: BACKEND + "/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // As variáveis do processo têm precedência sobre frontend/.env: o navegador fala só com o ensaio.
      command: "npm run dev --workspace frontend -- --host 127.0.0.1 --port 5183 --strictPort",
      url: FRONTEND,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_URL: BACKEND + "/api",
        VITE_SUPABASE_URL: BACKEND,
        VITE_SUPABASE_PUBLISHABLE_KEY: "chave-publica-de-ensaio",
      },
    },
  ],
});
