import { FUTURES_CACHE_TTL_MS } from "../server/config.js";
import { getTreasuryFuturesData, normalizeFuturesRange } from "../server/clients/futuresClient.js";

const cacheByRange = new Map();

export default async function handler(request, response) {
  const rawRange = Array.isArray(request.query?.range) ? request.query.range[0] : request.query?.range;
  const range = normalizeFuturesRange(rawRange);
  const cached = cacheByRange.get(range);

  if (cached && Date.now() < cached.expiresAt) {
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return response.status(200).json({
      ...cached.value,
      cache: { status: "hit", ttlSeconds: Math.round(FUTURES_CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getTreasuryFuturesData(range);
    const cachedEntry = { value: data, expiresAt: Date.now() + FUTURES_CACHE_TTL_MS };
    cacheByRange.set(range, cachedEntry);
    cacheByRange.set(data.range.key, cachedEntry);
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return response.status(200).json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(FUTURES_CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    const stale = cached?.value ? cached : cacheByRange.get("1D");
    if (stale?.value) {
      response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=900");
      return response.status(200).json({
        ...stale.value,
        cache: {
          status: "stale",
          ttlSeconds: Math.round(FUTURES_CACHE_TTL_MS / 1000),
          warning: "Using the last delayed futures snapshot because Yahoo Finance could not be reached."
        }
      });
    }

    return response.status(503).json({
      error: "Delayed Treasury-futures data unavailable",
      message: error instanceof Error ? error.message : "Unknown market-data error"
    });
  }
}
