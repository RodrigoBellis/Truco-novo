/**
 * Modo ensaio: a API real (rotas, middlewares, serviços e regras) sobre um armazenamento em
 * memória, sem Supabase. Só liga com TRUCO_REHEARSAL=1 explícito e nunca em produção: com
 * NODE_ENV=production o processo recusa subir em vez de servir dados fictícios.
 */
export function isRehearsalMode(): boolean {
  if (process.env.TRUCO_REHEARSAL !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TRUCO_REHEARSAL=1 não é permitido com NODE_ENV=production: o modo ensaio usa dados fictícios em memória.");
  }
  // O script de produção (npm start) não define NODE_ENV: a presença da chave de serviço também
  // recusa o modo ensaio. O ponto de entrada do ensaio apaga essas variáveis antes de carregar a API.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("TRUCO_REHEARSAL=1 recusado: há chave de serviço do Supabase neste processo. Use npm run dev:rehearsal.");
  }
  return true;
}
