// Entrada do MODO ENSAIO: a API real sobre dados fictícios em memória, sem Supabase.
// Uso: npm run dev:rehearsal --workspace backend   (porta 3101; não lê backend/.env)
//
// Liga a variável antes de carregar qualquer módulo da aplicação e apaga do processo as
// chaves do Supabase que o terminal por acaso tenha, para que nada neste modo as alcance.
// Com NODE_ENV=production a aplicação recusa subir (utils/rehearsalMode.ts).
process.env.TRUCO_REHEARSAL = "1";
process.env.PORT ??= "3101";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

await import("./server.js");

export {};
