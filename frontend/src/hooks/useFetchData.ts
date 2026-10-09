import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../services/api";

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Tentativas automáticas de uma atualização em segundo plano que falhou por rede ou servidor. */
const BACKGROUND_RETRIES = 5;
const BACKGROUND_RETRY_MS = 4_000;

export function useFetchData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const hasData = useRef(false);
  const retries = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setIsLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (cancelled) return;
        hasData.current = true;
        retries.current = 0;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Atualização em segundo plano (tempo real, depois de salvar) que falha por rede ou por
        // erro do servidor não derruba a tela que já está carregada — nem o formulário de placar
        // aberto nela: os dados anteriores ficam e a busca é repetida sozinha. Recusa da API
        // (4xx) e falha na primeira carga continuam aparecendo como erro.
        const transient = !(err instanceof ApiError) || err.status >= 500;
        if (hasData.current && transient && retries.current < BACKGROUND_RETRIES) {
          retries.current += 1;
          retryTimer = setTimeout(() => setReloadToken((token) => token + 1), BACKGROUND_RETRY_MS);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar os dados.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, isLoading, error, refetch };
}
