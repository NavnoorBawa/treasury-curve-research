import {
  FUTURES_RANGES,
  FUTURES_SOURCE,
  TREASURY_FUTURES
} from "../config.js";

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const REQUEST_TIMEOUT_MS = 10_000;
const QUOTE_FRESHNESS_MS = 45 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const LATEST_SESSION_LOOKBACK = { providerRange: "5d", providerInterval: "5m" };
const USER_AGENT = "TreasuryCurveResearch/1.0 (+https://treasury-curve-research.vercel.app/)";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, decimals) => Number(value.toFixed(decimals));
const CHICAGO_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const chicagoParts = (timestampMs) => Object.fromEntries(
  CHICAGO_DATE_PARTS.formatToParts(new Date(timestampMs))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value])
);

const isStandardCmeTreasurySessionOpen = (timestampMs) => {
  const parts = chicagoParts(timestampMs);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);

  if (parts.weekday === "Sun") return minutes >= 17 * 60;
  if (["Mon", "Tue", "Wed", "Thu"].includes(parts.weekday)) {
    return minutes < 16 * 60 || minutes >= 17 * 60;
  }
  if (parts.weekday === "Fri") return minutes < 16 * 60;
  return false;
};

export const deriveCmeTreasurySessionState = (nowMs, quoteTimeMs) => {
  if (!isStandardCmeTreasurySessionOpen(nowMs)) return "closed";
  if (!isFiniteNumber(quoteTimeMs)) return "stale";

  const quoteAgeMs = nowMs - quoteTimeMs;
  return quoteAgeMs >= -MAX_FUTURE_CLOCK_SKEW_MS && quoteAgeMs <= QUOTE_FRESHNESS_MS
    ? "open"
    : "stale";
};

const cmeTradeDateKey = (timestampMs) => {
  const parts = chicagoParts(timestampMs);
  const hour = Number(parts.hour);
  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (hour >= 17) localDate.setUTCDate(localDate.getUTCDate() + 1);
  return localDate.toISOString().slice(0, 10);
};

export const normalizeFuturesRange = (value) => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "1D";
  return Object.hasOwn(FUTURES_RANGES, normalized) ? normalized : "1D";
};

const extractEmbeddedSpark = (html, symbol) => {
  const scriptPattern = /<script\b[^>]*type="application\/json"[^>]*data-sveltekit-fetched[^>]*>([\s\S]*?)<\/script>/g;

  for (const match of html.matchAll(scriptPattern)) {
    try {
      const wrapper = JSON.parse(match[1]);
      if (typeof wrapper?.body !== "string") continue;
      const body = JSON.parse(wrapper.body);
      const result = body?.spark?.result?.find((item) => item.symbol === symbol);
      if (result?.response?.[0]) return result;
    } catch {
      // Yahoo pages contain multiple unrelated JSON payloads. Ignore non-spark blocks.
    }
  }

  throw new Error(`${symbol} quote page did not contain an embedded chart`);
};

const fetchQuotePageFallback = async () => {
  const settled = await Promise.allSettled(TREASURY_FUTURES.map(async (instrument) => {
    const response = await fetch(instrument.yahooPageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`${instrument.symbol} page returned HTTP ${response.status}`);
    return extractEmbeddedSpark(await response.text(), instrument.symbol);
  }));

  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!results.length) {
    const reasons = settled.flatMap((result) => result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : "quote page failed"]
      : []);
    throw new Error(`Yahoo quote-page fallback failed (${reasons.join("; ")})`);
  }

  return { spark: { result: results, error: null } };
};

const fetchSparkRequest = async ({ providerRange, providerInterval }) => {
  const symbols = TREASURY_FUTURES.map((instrument) => instrument.symbol).join(",");
  const query = new URLSearchParams({
    symbols,
    range: providerRange,
    interval: providerInterval,
    includePrePost: "true"
  });
  const errors = [];

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(`https://${host}/v7/finance/spark?${query}`, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (payload?.spark?.error || !Array.isArray(payload?.spark?.result)) {
        throw new Error(payload?.spark?.error?.description ?? "Unexpected Yahoo Finance response");
      }

      return payload;
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  throw new Error(`Yahoo spark request failed (${errors.join("; ")})`);
};

const fetchIndividualChart = async (instrument, range) => {
  const query = new URLSearchParams({
    range: range.providerRange,
    interval: range.providerInterval,
    includePrePost: "true"
  });
  const errors = [];

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(instrument.symbol)}?${query}`,
        {
          headers: {
            Accept: "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": USER_AGENT
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const chart = payload?.chart?.result?.[0];
      if (!chart || payload?.chart?.error) {
        throw new Error(payload?.chart?.error?.description ?? "Unexpected Yahoo chart response");
      }
      return { symbol: instrument.symbol, response: [chart] };
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  throw new Error(`${instrument.symbol} chart request failed (${errors.join("; ")})`);
};

const fetchIndividualChartPayload = async (range) => {
  const settled = await Promise.allSettled(
    TREASURY_FUTURES.map((instrument) => fetchIndividualChart(instrument, range))
  );
  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!results.length) {
    const reasons = settled.flatMap((result) => result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : "chart request failed"]
      : []);
    throw new Error(`Yahoo individual chart requests failed (${reasons.join("; ")})`);
  }
  return { spark: { result: results, error: null } };
};

const payloadHasSeries = (payload) => (payload?.spark?.result ?? []).some((result) => {
  const chart = result?.response?.[0];
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const closes = Array.isArray(chart?.indicators?.quote?.[0]?.close)
    ? chart.indicators.quote[0].close
    : [];
  return timestamps.some((timestamp, index) => isFiniteNumber(timestamp) && isFiniteNumber(closes[index]));
});

const payloadHasCompleteSeries = (payload) => TREASURY_FUTURES.every((instrument) => {
  const result = (payload?.spark?.result ?? []).find((item) => item.symbol === instrument.symbol);
  return payloadHasSeries({ spark: { result: result ? [result] : [] } });
});

const fetchSparkPayload = async (rangeKey) => {
  const range = FUTURES_RANGES[rangeKey];
  const errors = [];
  let snapshotPayload = null;

  for (const [label, loader] of [
    ["spark", () => fetchSparkRequest(range)],
    ["individual chart", () => fetchIndividualChartPayload(range)]
  ]) {
    try {
      const payload = await loader();
      snapshotPayload ??= payload;
      if (payloadHasCompleteSeries(payload)) {
        return {
          payload,
          actualRange: rangeKey,
          latestSessionOnly: false,
          seriesMode: "requested-range",
          warnings: []
        };
      }
      errors.push(`${label}: incomplete bars for ${range.providerRange}`);
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  if (rangeKey === "1D") {
    for (const [label, loader] of [
      ["5-day spark", () => fetchSparkRequest(LATEST_SESSION_LOOKBACK)],
      ["5-day individual chart", () => fetchIndividualChartPayload(LATEST_SESSION_LOOKBACK)]
    ]) {
      try {
        const payload = await loader();
        snapshotPayload ??= payload;
        if (payloadHasCompleteSeries(payload)) {
          return {
            payload,
            actualRange: "1D",
            latestSessionOnly: true,
            seriesMode: "latest-session",
            warnings: [
              "No bars were returned for the 1-day request; showing each contract's latest available CME trade session from Yahoo's 5-day chart history. A change is shown only when a prior CME trade-session bar is available."
            ]
          };
        }
        errors.push(`${label}: incomplete bars`);
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }
  }

  let quotePageError;
  try {
    const payload = await fetchQuotePageFallback();
    return {
      payload,
      actualRange: "1D",
      latestSessionOnly: false,
      seriesMode: payloadHasSeries(payload) ? "requested-range" : "snapshot-only",
      warnings: [
        payloadHasSeries(payload)
          ? "Yahoo chart endpoints were unavailable; showing the embedded quote-page series instead."
          : "Yahoo chart endpoints were unavailable; showing delayed quote snapshots only. No verified intraday bars were returned."
      ]
    };
  } catch (fallbackError) {
    quotePageError = fallbackError;
  }

  if (snapshotPayload) {
    return {
      payload: snapshotPayload,
      actualRange: rangeKey,
      latestSessionOnly: false,
      seriesMode: "snapshot-only",
      warnings: [
        "Yahoo returned delayed quote snapshots but no verified intraday bars; the chart is unavailable."
      ]
    };
  }

  throw new Error(
    `Delayed Treasury-futures feed unavailable (${errors.join("; ")}; ${quotePageError instanceof Error ? quotePageError.message : "fallback failed"})`
  );
};

const normalizeSeries = (chart) => {
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const closes = Array.isArray(chart?.indicators?.quote?.[0]?.close)
    ? chart.indicators.quote[0].close
    : [];
  const deduplicated = new Map();

  for (let index = 0; index < Math.min(timestamps.length, closes.length); index += 1) {
    const timestampSeconds = timestamps[index];
    const price = closes[index];
    if (!isFiniteNumber(timestampSeconds) || !isFiniteNumber(price)) continue;
    deduplicated.set(timestampSeconds, {
      timestamp: timestampSeconds * 1000,
      price
    });
  }

  return [...deduplicated.values()].sort((left, right) => left.timestamp - right.timestamp);
};

const latestCmeSessionSeries = (series) => {
  const latest = series.at(-1);
  if (!latest) return [];
  const latestTradeDate = cmeTradeDateKey(latest.timestamp);
  return series.filter((point) => cmeTradeDateKey(point.timestamp) === latestTradeDate);
};

const priorCmeSessionClose = (series) => {
  const latest = series.at(-1);
  if (!latest) return null;
  const latestTradeDate = cmeTradeDateKey(latest.timestamp);

  for (let index = series.length - 2; index >= 0; index -= 1) {
    if (cmeTradeDateKey(series[index].timestamp) !== latestTradeDate) {
      return series[index].price;
    }
  }
  return null;
};

const sessionSeriesForTradeDate = (series, tradeDate) => tradeDate
  ? series.filter((point) => cmeTradeDateKey(point.timestamp) === tradeDate)
  : [];

const validMetaRange = (meta, price) => {
  const low = meta?.regularMarketDayLow;
  const high = meta?.regularMarketDayHigh;
  return isFiniteNumber(low) && isFiniteNumber(high) && low <= price && price <= high
    ? { low, high }
    : null;
};

const normalizeInstrument = (definition, result, options) => {
  const chart = result?.response?.[0];
  const meta = chart?.meta;
  if (!meta || meta.symbol !== definition.symbol || meta.instrumentType !== "FUTURE") {
    throw new Error(`${definition.symbol} did not return a valid futures quote`);
  }

  const fullSeries = normalizeSeries(chart);
  const series = options.latestSessionOnly ? latestCmeSessionSeries(fullSeries) : fullSeries;
  const latestSeriesPoint = series.at(-1);
  const metaPrice = isFiniteNumber(meta.regularMarketPrice) ? meta.regularMarketPrice : null;
  const price = latestSeriesPoint?.price ?? metaPrice;
  const fallbackPreviousClose = isFiniteNumber(meta.previousClose) ? meta.previousClose : meta.chartPreviousClose;
  const previousCloseCandidate = options.latestSessionOnly
    ? priorCmeSessionClose(fullSeries)
    : fallbackPreviousClose;
  const previousClose = isFiniteNumber(previousCloseCandidate) && previousCloseCandidate > 0
    ? previousCloseCandidate
    : null;
  if (!isFiniteNumber(price)) {
    throw new Error(`${definition.symbol} is missing a valid price`);
  }

  const priceChange = previousClose === null
    ? null
    : round(Math.round((price - previousClose) / definition.minTick) * definition.minTick, 8);
  const priceChangePct = priceChange === null ? null : round((priceChange / previousClose) * 100, 6);
  const quoteTimeMs = latestSeriesPoint?.timestamp
    ?? (isFiniteNumber(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null);
  const tradeDate = isFiniteNumber(quoteTimeMs) ? cmeTradeDateKey(quoteTimeMs) : null;
  const sessionSeries = sessionSeriesForTradeDate(fullSeries, tradeDate);
  const sessionPrices = sessionSeries.map((point) => point.price);
  const metaRange = validMetaRange(meta, price);
  const dayLow = sessionPrices.length ? Math.min(...sessionPrices) : metaRange?.low ?? null;
  const dayHigh = sessionPrices.length ? Math.max(...sessionPrices) : metaRange?.high ?? null;
  const metaQuoteTimeMs = isFiniteNumber(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null;
  const metaTradeDate = isFiniteNumber(metaQuoteTimeMs) ? cmeTradeDateKey(metaQuoteTimeMs) : null;
  const marketState = deriveCmeTreasurySessionState(options.nowMs, quoteTimeMs);
  const comparisonLabel = previousClose === null
    ? "Unavailable"
    : options.latestSessionOnly ? "Prior session last" : "Prior close";
  const dataQuality = !series.length
    ? "snapshot-only"
    : series.length < 2 || previousClose === null
      ? "insufficient-history"
      : "verified-session";

  return {
    ...definition,
    contractName: typeof meta.shortName === "string" ? meta.shortName : `${definition.label} Futures`,
    exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : FUTURES_SOURCE.exchange,
    currency: typeof meta.currency === "string" ? meta.currency : "USD",
    price,
    previousClose,
    priceChange,
    priceChangePct,
    changeThirtySeconds: priceChange === null ? null : round(priceChange * 32, 4),
    comparisonLabel,
    dayHigh,
    dayLow,
    volume: metaTradeDate === tradeDate && isFiniteNumber(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
    quoteTime: isFiniteNumber(quoteTimeMs) ? new Date(quoteTimeMs).toISOString() : null,
    tradeDate,
    sessionBars: sessionSeries.length,
    dataQuality,
    marketState,
    rateDirection: priceChange === null ? "unavailable" : priceChange > 0 ? "lower" : priceChange < 0 ? "higher" : "unchanged",
    series
  };
};

export const normalizeFuturesPayload = (payload, requestedRange = "1D", options = {}) => {
  const rangeKey = normalizeFuturesRange(requestedRange);
  const normalizationOptions = {
    latestSessionOnly: options.latestSessionOnly === true,
    seriesMode: options.seriesMode ?? "requested-range",
    nowMs: isFiniteNumber(options.nowMs) ? options.nowMs : Date.now()
  };
  const resultBySymbol = new Map(
    (payload?.spark?.result ?? []).map((result) => [result.symbol, result])
  );
  const instruments = [];
  const warnings = [];

  for (const definition of TREASURY_FUTURES) {
    try {
      const instrument = normalizeInstrument(definition, resultBySymbol.get(definition.symbol), normalizationOptions);
      instruments.push(instrument);
      if (normalizationOptions.seriesMode !== "snapshot-only" && !instrument.series.length) {
        warnings.push(`${definition.symbol} returned a quote but no verified chart bars`);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${definition.symbol} is unavailable`);
    }
  }

  if (!instruments.length) {
    throw new Error(`No valid Treasury-futures instruments were returned. ${warnings.join(" ")}`);
  }

  const latestSeriesTimestamp = instruments
    .flatMap((instrument) => instrument.series.map((point) => point.timestamp))
    .sort((left, right) => left - right)
    .at(-1);
  const datedInstruments = instruments.filter((instrument) => instrument.tradeDate);
  const tradeDates = [...new Set(datedInstruments.map((instrument) => instrument.tradeDate))].sort();
  const sessionCoherence = tradeDates.length === 1 && datedInstruments.length === instruments.length
    ? "coherent"
    : tradeDates.length || datedInstruments.length ? "mixed" : "unavailable";

  if (sessionCoherence === "mixed") {
    warnings.push("Contracts are not synchronized to one CME trade date. Read each contract's date and freshness independently; no aggregate live-market state is implied.");
  }

  for (const instrument of instruments) {
    if (instrument.dataQuality === "insufficient-history") {
      warnings.push(`${instrument.symbol} has insufficient verified session history; no directional change is reported unless a prior-session bar is available.`);
    }
  }

  return {
    source: {
      ...FUTURES_SOURCE,
      retrievedAt: new Date().toISOString(),
      delayed: true,
      displayUse: "Indicative intraday market reference only",
      seriesMode: normalizationOptions.seriesMode,
      seriesAsOf: isFiniteNumber(latestSeriesTimestamp) ? new Date(latestSeriesTimestamp).toISOString() : null,
      latestTradeDate: tradeDates.at(-1) ?? null,
      sessionCoherence
    },
    range: {
      key: rangeKey,
      ...FUTURES_RANGES[rangeKey]
    },
    instruments,
    warnings
  };
};

export const getTreasuryFuturesData = async (requestedRange = "1D") => {
  const rangeKey = normalizeFuturesRange(requestedRange);
  const result = await fetchSparkPayload(rangeKey);
  const normalized = normalizeFuturesPayload(result.payload, result.actualRange, {
    latestSessionOnly: result.latestSessionOnly,
    seriesMode: result.seriesMode
  });
  return {
    ...normalized,
    warnings: [...result.warnings, ...normalized.warnings]
  };
};
