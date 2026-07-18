import assert from "node:assert/strict";
import {
  deriveCmeTreasurySessionState,
  getTreasuryFuturesData,
  normalizeFuturesPayload
} from "../server/clients/futuresClient.js";

const definitions = [
  ["ZT=F", "2-Year T-Note Futures,Sep-2026", 103.25, 103.125],
  ["ZF=F", "5-Year T-Note Futures,Sep-2026", 107.5, 107.625],
  ["ZN=F", "10-Year T-Note Futures,Sep-2026", 110.25, 110.25],
  ["UB=F", "Ultra U.S. Treasury Bond Futures,Sep-2026", 115.75, 115.5]
];

const fixture = {
  spark: {
    error: null,
    result: definitions.map(([symbol, shortName, price, previousClose], index) => ({
      symbol,
      response: [{
        meta: {
          symbol,
          instrumentType: "FUTURE",
          shortName,
          fullExchangeName: "CBOT",
          currency: "USD",
          regularMarketPrice: price,
          previousClose,
          regularMarketDayHigh: price + 0.25,
          regularMarketDayLow: price - 0.25,
          regularMarketVolume: 100_000 + index,
          regularMarketTime: 1_783_717_199 + index,
          currentTradingPeriod: { regular: { start: 1, end: 2 } }
        },
        timestamp: [1_783_716_900, 1_783_717_200],
        indicators: { quote: [{ close: [previousClose, price] }] }
      }]
    }))
  }
};

const normalized = normalizeFuturesPayload(fixture, "5D", {
  nowMs: Date.parse("2026-07-10T20:59:00Z")
});
assert.equal(normalized.range.key, "5D");
assert.equal(normalized.source.seriesMode, "requested-range");
assert.deepEqual(normalized.instruments.map((instrument) => instrument.symbol), ["ZT=F", "ZF=F", "ZN=F", "UB=F"]);
assert.equal(normalized.warnings.length, 0);

for (const instrument of normalized.instruments) {
  assert.equal(instrument.priceChange, Number((instrument.price - instrument.previousClose).toFixed(8)));
  assert.equal(instrument.changeThirtySeconds, Number((instrument.priceChange * 32).toFixed(4)));
  assert.equal(instrument.priceChangePct, Number(((instrument.priceChange / instrument.previousClose) * 100).toFixed(6)));
  assert.equal(instrument.series.length, 2);
  assert.ok(instrument.series[0].timestamp < instrument.series[1].timestamp);
  assert.equal(instrument.exchange, "CBOT");
}

assert.equal(normalized.instruments[0].rateDirection, "lower", "A higher futures price must imply a lower yield tendency");
assert.equal(normalized.instruments[1].rateDirection, "higher", "A lower futures price must imply a higher yield tendency");
assert.equal(normalized.instruments[2].rateDirection, "unchanged");
assert.equal(normalized.instruments[3].rateDirection, "lower");

assert.equal(
  deriveCmeTreasurySessionState(Date.parse("2026-07-12T21:30:00Z"), Date.parse("2026-07-10T20:59:00Z")),
  "closed",
  "Sunday before the 5:00 p.m. CT reopen must be closed"
);
assert.equal(
  deriveCmeTreasurySessionState(Date.parse("2026-07-12T22:30:00Z"), Date.parse("2026-07-12T22:20:00Z")),
  "open",
  "Sunday after the 5:00 p.m. CT reopen with a fresh quote must be open"
);
assert.equal(
  deriveCmeTreasurySessionState(Date.parse("2026-07-15T21:30:00Z"), Date.parse("2026-07-15T21:29:00Z")),
  "closed",
  "The 4:00-5:00 p.m. CT maintenance interval must be closed"
);
assert.equal(
  deriveCmeTreasurySessionState(Date.parse("2026-07-15T20:30:00Z"), Date.parse("2026-07-15T20:20:00Z")),
  "open",
  "A fresh quote during standard CME hours must be open"
);
assert.equal(
  deriveCmeTreasurySessionState(Date.parse("2026-07-13T15:00:00Z"), Date.parse("2026-07-10T20:59:00Z")),
  "stale",
  "Standard hours with no fresh quote must not be reported as open"
);

const latestSession = normalizeFuturesPayload(fixture, "1D", {
  latestSessionOnly: true,
  seriesMode: "latest-session",
  nowMs: Date.parse("2026-07-12T21:30:00Z")
});
assert.equal(latestSession.source.seriesMode, "latest-session");
assert.ok(latestSession.source.seriesAsOf);
assert.ok(latestSession.instruments.every((instrument) => instrument.marketState === "closed"));
assert.ok(latestSession.instruments.every((instrument) => instrument.previousClose === null));
assert.ok(latestSession.instruments.every((instrument) => instrument.rateDirection === "unavailable"));

const weekendFallbackFixture = structuredClone(fixture);
for (const result of weekendFallbackFixture.spark.result) {
  const chart = result.response[0];
  const priorSessionClose = chart.meta.regularMarketPrice + 0.125;
  chart.meta.previousClose = chart.meta.regularMarketPrice;
  chart.timestamp = [
    Date.parse("2026-07-09T20:55:00Z") / 1000,
    Date.parse("2026-07-09T22:00:00Z") / 1000,
    Date.parse("2026-07-10T20:59:00Z") / 1000
  ];
  chart.indicators.quote[0].close = [
    priorSessionClose,
    chart.meta.regularMarketPrice + 0.0625,
    chart.meta.regularMarketPrice
  ];
}
const weekendFallback = normalizeFuturesPayload(weekendFallbackFixture, "1D", {
  latestSessionOnly: true,
  seriesMode: "latest-session",
  nowMs: Date.parse("2026-07-12T21:30:00Z")
});
assert.equal(
  weekendFallback.instruments[0].previousClose,
  weekendFallbackFixture.spark.result[0].response[0].meta.regularMarketPrice + 0.125,
  "Latest-session fallback must use the prior CME session close, not Yahoo's weekend-reset previousClose"
);
assert.equal(weekendFallback.instruments[0].changeThirtySeconds, -4);

const roundedQuoteFixture = structuredClone(fixture);
roundedQuoteFixture.spark.result[0].response[0].meta.regularMarketPrice = 103.24999;
const roundedQuote = normalizeFuturesPayload(roundedQuoteFixture, "1D").instruments[0];
assert.equal(roundedQuote.priceChange, 0.125, "Yahoo decimal rounding must snap to the contract's minimum tick");
assert.equal(roundedQuote.changeThirtySeconds, 4);

const partialFixture = structuredClone(fixture);
partialFixture.spark.result = partialFixture.spark.result.filter((result) => result.symbol !== "UB=F");
const partial = normalizeFuturesPayload(partialFixture, "INVALID");
assert.equal(partial.range.key, "1D", "Unsupported ranges must fall back to the allowlisted default");
assert.equal(partial.instruments.length, 3);
assert.match(partial.warnings[0], /UB=F/);

const mixedSessionFixture = structuredClone(fixture);
const mixedFiveYear = mixedSessionFixture.spark.result.find((result) => result.symbol === "ZF=F").response[0];
mixedFiveYear.meta.regularMarketPrice = 999;
mixedFiveYear.meta.previousClose = 999;
mixedFiveYear.meta.regularMarketDayLow = 100;
mixedFiveYear.meta.regularMarketDayHigh = 101;
mixedFiveYear.meta.regularMarketTime = Date.parse("2026-07-12T22:05:00Z") / 1000;
mixedFiveYear.timestamp = [Date.parse("2026-07-12T22:05:00Z") / 1000];
mixedFiveYear.indicators.quote[0].close = [106.5];
const mixedSession = normalizeFuturesPayload(mixedSessionFixture, "1D", {
  latestSessionOnly: true,
  seriesMode: "latest-session",
  nowMs: Date.parse("2026-07-12T22:10:00Z")
});
const mixedFiveYearResult = mixedSession.instruments.find((instrument) => instrument.symbol === "ZF=F");
assert.equal(mixedSession.source.sessionCoherence, "mixed", "Cross-contract trade-date disagreement must be explicit");
assert.match(mixedSession.warnings.join(" "), /not synchronized/);
assert.equal(mixedFiveYearResult.price, 106.5, "Latest-session price must come from the verified session series");
assert.equal(mixedFiveYearResult.dayLow, 106.5, "Session range must be derived from the same session series");
assert.equal(mixedFiveYearResult.dayHigh, 106.5, "Session range must contain the displayed price");
assert.equal(mixedFiveYearResult.previousClose, null, "One-bar series must not invent a prior-session comparison");
assert.equal(mixedFiveYearResult.priceChange, null);
assert.equal(mixedFiveYearResult.rateDirection, "unavailable");

if (process.argv.includes("--live")) {
  const live = await getTreasuryFuturesData("1D");
  assert.equal(live.instruments.length, 4, `Expected four live contracts; warnings: ${live.warnings.join(" ")}`);
  for (const instrument of live.instruments) {
    assert.ok(Number.isFinite(instrument.price));
    assert.ok(instrument.series.length > 0, `${instrument.symbol} returned no intraday bars`);
    assert.ok(instrument.quoteTime, `${instrument.symbol} returned no quote timestamp`);
    if (instrument.dayLow !== null && instrument.dayHigh !== null) {
      assert.ok(instrument.dayLow <= instrument.price && instrument.price <= instrument.dayHigh, `${instrument.symbol} price is outside its normalized session range`);
    }
    if (instrument.previousClose === null) {
      assert.equal(instrument.priceChange, null);
      assert.equal(instrument.rateDirection, "unavailable");
    } else {
      assert.ok(Number.isFinite(instrument.priceChange));
    }
  }
  console.log(`Live Yahoo check: ${live.instruments.map((instrument) => `${instrument.symbol} ${instrument.price}`).join(" | ")}`);
  if (live.warnings.length) console.log(`Live source warning: ${live.warnings.join(" ")}`);
}

console.log("Treasury-futures normalization, inverse-direction logic, allowlisting, and partial-feed handling verified.");
