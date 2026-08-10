import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Reage a qualquer INSERT/UPDATE em truco_matches (novo resultado, mesa/fila mudou) e
 * chama `onChange` — normalmente o `refetch` de um useFetchData — para atualizar a tela
 * sem precisar de F5. O que cada usuário efetivamente recebe já é filtrado pela RLS do
 * Supabase (jogador só é notificado de mudanças que ele teria permissão de ler).
 *
 * Debounce de 300ms: uma geração de escala pode disparar dezenas de eventos de uma vez
 * (uma linha por partida), e não faz sentido refetch uma vez por linha.
 */
export function useRealtimeMatches(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let debounceTimer: number | undefined;

    const channel = supabase
      .channel("truco-matches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "truco_matches" }, () => {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => onChangeRef.current(), 300);
      })
      .subscribe();

    return () => {
      window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, []);
}
