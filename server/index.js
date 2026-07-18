import compression from "compression";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_TTL_MS, FUTURES_CACHE_TTL_MS, HISTORY_CACHE_TTL_MS, PORT } from "./config.js";
import { MemoryCache } from "./cache.js";
import { getTreasuryFuturesData, normalizeFuturesRange } from "./clients/futuresClient.js";
import { getHistoricalYieldData } from "./clients/historicalClient.js";
import { getTreasuryYieldData } from "./clients/treasuryClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const cache = new MemoryCache();
const historyCache = new MemoryCache();
const futuresCaches = new Map();

app.disable("x-powered-by");
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    },
    frameguard: {
      action: "deny"
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin"
    }
  })
);

app.use((_request, response, next) => {
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "treasury-curve-research" });
});

app.get("/api/yields", async (_request, response) => {
  const cached = cache.get();

  if (cached?.isFresh) {
    response.setHeader("Cache-Control", "public, max-age=60");
    return response.json({
      ...cached.value,
      cache: { status: "hit", ttlSeconds: Math.round(CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getTreasuryYieldData();
    cache.set(data, CACHE_TTL_MS);
    response.setHeader("Cache-Control", "public, max-age=60");
    return response.json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    if (cached?.value) {
      return response.status(200).json({
        ...cached.value,
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
});

app.get("/api/history", async (_request, response) => {
  const cached = historyCache.get();

  if (cached?.isFresh) {
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.json({
      ...cached.value,
      cache: { status: "hit", ttlSeconds: Math.round(HISTORY_CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getHistoricalYieldData();
    historyCache.set(data, HISTORY_CACHE_TTL_MS);
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(HISTORY_CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    if (cached?.value) {
      return response.status(200).json({
        ...cached.value,
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
});

app.get("/api/futures", async (request, response) => {
  const rawRange = Array.isArray(request.query.range) ? request.query.range[0] : request.query.range;
  const range = normalizeFuturesRange(rawRange);
  const futuresCache = futuresCaches.get(range) ?? new MemoryCache();
  futuresCaches.set(range, futuresCache);
  const cached = futuresCache.get();

  if (cached?.isFresh) {
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return response.json({
      ...cached.value,
      cache: { status: "hit", ttlSeconds: Math.round(FUTURES_CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getTreasuryFuturesData(range);
    futuresCache.set(data, FUTURES_CACHE_TTL_MS);
    if (data.range.key !== range) {
      const fallbackRangeCache = futuresCaches.get(data.range.key) ?? new MemoryCache();
      fallbackRangeCache.set(data, FUTURES_CACHE_TTL_MS);
      futuresCaches.set(data.range.key, fallbackRangeCache);
    }
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return response.json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(FUTURES_CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    const fallbackCached = futuresCaches.get("1D")?.get();
    const stale = cached?.value ? cached : fallbackCached;
    if (stale?.value) {
      response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
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
});

const distPath = path.resolve(__dirname, "..", "dist");
app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(distPath));

app.use((_request, response) => {
  response.status(404).sendFile(path.join(distPath, "404.html"));
});

const server = app.listen(PORT);

server.on("listening", () => {
  console.log(`U.S. Treasury Curve Research listening on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error(`U.S. Treasury Curve Research could not bind to port ${PORT}: ${error.message}`);
  process.exitCode = 1;
});
