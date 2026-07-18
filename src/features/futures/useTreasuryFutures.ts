import { useQuery } from "@tanstack/react-query";
import type { FuturesPayload, FuturesRange } from "@/domain/treasury/types";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const fetchTreasuryFutures = async (range: FuturesRange, signal?: AbortSignal): Promise<FuturesPayload> => {
  const response = await fetch(`/api/futures?range=${range}`, {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Delayed Treasury-futures request failed.");
  }

  return payload;
};

export function useTreasuryFutures(range: FuturesRange) {
  return useQuery({
    queryKey: ["treasury-futures", range],
    queryFn: ({ signal }) => fetchTreasuryFutures(range, signal),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000
  });
}
