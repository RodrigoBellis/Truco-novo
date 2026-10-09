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
 *
 * Rede de segurança: o tempo real não entrega tudo (a RLS não notifica o jogador sobre jogos
 * de mata-mata de outras duplas) e a conexão pode cair sem aviso. Por isso a tela também se
 * atualiza sozinha a cada 20 s enquanto está visível e sempre que volta a ficar visível.
 */
const FALLBACK_REFRESH_MS = 20_000;

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

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") onChangeRef.current();
    };
    const fallbackTimer = window.setInterval(refreshIfVisible, FALLBACK_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearTimeout(debounceTimer);
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      void supabase.removeChannel(channel);
    };
  }, []);
}
