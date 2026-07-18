import { CACHE_TTL_MS } from "../server/config.js";
import { getTreasuryYieldData } from "../server/clients/treasuryClient.js";

let cachedValue = null;
let expiresAt = 0;

export default async function handler(_request, response) {
  if (cachedValue && Date.now() < expiresAt) {
    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json({
      ...cachedValue,
      cache: { status: "hit", ttlSeconds: Math.round(CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getTreasuryYieldData();
    cachedValue = data;
    expiresAt = Date.now() + CACHE_TTL_MS;
    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    if (cachedValue) {
      return response.status(200).json({
        ...cachedValue,
        cache: {
          status: "stale",
          ttlSeconds: Math.round(CACHE_TTL_MS / 1000),
          warning: "Using stale cached data because the Treasury feed could not be reached."
        }
      });
    }

    return response.status(503).json({
      error: "Treasury data unavailable",
      message: error instanceof Error ? error.message : "Unknown feed error"
    });
  }
}
