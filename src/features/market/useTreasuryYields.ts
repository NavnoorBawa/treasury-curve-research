import { useQuery } from "@tanstack/react-query";
import type { TreasuryPayload } from "@/domain/treasury/types";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const fetchTreasuryYields = async (signal?: AbortSignal): Promise<TreasuryPayload> => {
  const response = await fetch("/api/yields", {
    signal,
    headers: {
      Accept: "application/json"
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Treasury data request failed.");
  }

  return payload;
};

export function useTreasuryYields() {
  return useQuery({
    queryKey: ["treasury-yields"],
    queryFn: ({ signal }) => fetchTreasuryYields(signal),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000
  });
}
