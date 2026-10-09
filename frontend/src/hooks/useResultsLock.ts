import { useFetchData } from "./useFetchData";
import { getResultsLock } from "../services/matchesService";

/**
 * Cadeado global de resultados. Enquanto o estado não chega — ou se a consulta falhar — a tela
 * se comporta como bloqueada: é o lado seguro, e a API recusa do mesmo jeito.
 */
export function useResultsLock() {
  const { data, isLoading, error, refetch } = useFetchData(getResultsLock);
  return { locked: data?.locked !== false, isLoading, error, refetch };
}
