import { useQuery } from "@tanstack/react-query";
import type { HistoricalPayload } from "@/domain/treasury/types";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const fetchHistoricalYields = async (signal?: AbortSignal): Promise<HistoricalPayload> => {
  const response = await fetch("/api/history", {
    signal,
    headers: {
      Accept: "application/json"
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Historical Treasury data request failed.");
  }

  return payload;
};

export function useHistoricalYields(enabled = true) {
  return useQuery({
    queryKey: ["historical-treasury-yields"],
    queryFn: ({ signal }) => fetchHistoricalYields(signal),
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    staleTime: 20 * 60 * 1000
  });
}
