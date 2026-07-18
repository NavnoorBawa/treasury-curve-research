import { HISTORY_CACHE_TTL_MS } from "../server/config.js";
import { getHistoricalYieldData } from "../server/clients/historicalClient.js";

let cachedValue = null;
let expiresAt = 0;

export default async function handler(_request, response) {
  if (cachedValue && Date.now() < expiresAt) {
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    return response.status(200).json({
      ...cachedValue,
      cache: { status: "hit", ttlSeconds: Math.round(HISTORY_CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getHistoricalYieldData();
    cachedValue = data;
    expiresAt = Date.now() + HISTORY_CACHE_TTL_MS;
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    return response.status(200).json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(HISTORY_CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    if (cachedValue) {
      return response.status(200).json({
        ...cachedValue,
        cache: {
          status: "stale",
          ttlSeconds: Math.round(HISTORY_CACHE_TTL_MS / 1000),
          warning: "Using stale cached data because the Federal Reserve H.15 download could not be reached."
        }
      });
    }

    return response.status(503).json({
      error: "Historical Treasury data unavailable",
      message: error instanceof Error ? error.message : "Unknown historical feed error"
    });
  }
}
