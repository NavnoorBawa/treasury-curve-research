import assert from "node:assert/strict";
import {
  buildCurveMove,
  buildCurveRegimeTimeline,
  buildStats,
  buildTreasuryCurveCsv,
  classifyCurveMove,
  curvePairs,
  getEventMarkerDate,
  movementRationale
} from "../src/domain/treasury/research.ts";
import { buildWeeklyCurveResearch } from "../src/domain/treasury/weeklyOutlook.ts";
import { buildYearEndForecast, estimateDnsFactors } from "../src/domain/treasury/yearEndForecast.ts";
import { sampleTimeSeriesByExtrema } from "../src/domain/treasury/chartSampling.ts";

const expectedClassifications = [
  [4, -1, "Bull steepening"],
  [4, 1, "Bear steepening"],
  [-4, -1, "Bull flattening"],
  [-4, 1, "Bear flattening"],
  [3, -1, "Parallel shift lower"],
  [-3, 1, "Parallel shift higher"]
];

for (const [spreadDeltaBps, levelDeltaBps, expected] of expectedClassifications) {
  assert.equal(classifyCurveMove(spreadDeltaBps, levelDeltaBps, 3), expected);
}

assert.equal(classifyCurveMove(4, 0, 3), "Neutral / unclassified", "Zero pair average must not be forced into a bull or bear regime");

const pair = curvePairs.find((item) => item.key === "10Y2Y");
assert.ok(pair, "10Y-2Y curve pair is required");

const row = (date, twoYear, fiveYear, tenYear, thirtyYear) => ({
  date,
  "2Y": twoYear,
  "5Y": fiveYear,
  "10Y": tenYear,
  "30Y": thirtyYear,
  "5Y2Y": (fiveYear - twoYear) * 100,
  "10Y2Y": (tenYear - twoYear) * 100,
  "30Y2Y": (thirtyYear - twoYear) * 100,
  "10Y5Y": (tenYear - fiveYear) * 100,
  "30Y5Y": (thirtyYear - fiveYear) * 100,
  "30Y10Y": (thirtyYear - tenYear) * 100
});

const reference = row("2026-01-02", 4, 4.2, 4.5, 4.8);
const asOf = row("2026-01-09", 4.1, 4.3, 4.7, 4.9);
const move = buildCurveMove(reference, asOf, pair, 3);
assert.ok(move, "Curve move should be calculated for complete pair observations");
assert.equal(move.shortDeltaBps, 10);
assert.equal(move.longDeltaBps, 20);
assert.equal(move.spreadDeltaBps, 10);
assert.equal(move.levelDeltaBps, 15);
assert.equal(move.type, "Bear steepening");
assert.match(movementRationale("Neutral / unclassified", pair, 0), /excluded from the six directional regime counts/);

const statsRows = [
  row("2026-01-02", 4, 4.2, 4.5, 4.8),
  row("2026-01-05", 4.2, 4.3, 4.6, 4.9),
  row("2026-01-06", 4.1, 4.25, 4.55, 4.85)
];
const twoYearStats = buildStats(statsRows).find((item) => item.key === "2Y");
assert.ok(twoYearStats, "2Y statistics are required");
assert.equal(twoYearStats.latest, 4.1);
assert.equal(twoYearStats.latestObservationDate, "2026-01-06");
assert.equal(twoYearStats.min, 4);
assert.equal(twoYearStats.max, 4.2);
assert.equal(twoYearStats.average, 4.1);
assert.equal(twoYearStats.observations, 3);
assert.ok(Math.abs(twoYearStats.percentile - 66.6666666667) < 1e-6);
assert.ok(twoYearStats.annualizedVolBps > 0);

const timelineRows = [
  row("2026-01-30", 4, 4.2, 4.5, 4.8),
  row("2026-02-27", 4.1, 4.25, 4.55, 4.85),
  row("2026-03-10", 4.15, 4.3, 4.6, 4.9)
];
const completedMonthlyTimeline = buildCurveRegimeTimeline(timelineRows, pair, "2026-01-01", "2026-03-10", "1M");
assert.equal(completedMonthlyTimeline.length, 1, "Open terminal months must remain unclassified");
assert.equal(completedMonthlyTimeline[0].comparisonDate, "2026-01-30");
assert.equal(completedMonthlyTimeline[0].date, "2026-02-27");

const neutralTimelineRows = [
  row("2026-01-30", 4, 4.2, 4.5, 4.8),
  row("2026-02-27", 4, 4.2, 4.5, 4.8),
  row("2026-03-10", 4.1, 4.3, 4.6, 4.9)
];
const neutralMonthlyTimeline = buildCurveRegimeTimeline(neutralTimelineRows, pair, "2026-01-01", "2026-03-10", "1M");
assert.equal(neutralMonthlyTimeline.length, 1);
assert.equal(neutralMonthlyTimeline[0].type, "Neutral / unclassified", "No-move periods must be excluded from the six directional regimes");

assert.equal(
  getEventMarkerDate(
    { id: "911", title: "September 11 attacks", category: "Geopolitical", startDate: "2001-09-11", description: "Test event" },
    [row("2001-09-10", 4, 4.2, 4.5, 4.8), row("2001-09-13", 3.9, 4.1, 4.4, 4.7)],
    "2001-09-01",
    "2001-09-30"
  ),
  "2001-09-13",
  "Events without same-day CMT data should mark the next available observation"
);

const csv = buildTreasuryCurveCsv([statsRows[0]]);
const [header, csvRow] = csv.split("\n");
assert.equal(
  header,
  "date,2Y_yield_pct_pa,5Y_yield_pct_pa,10Y_yield_pct_pa,30Y_yield_pct_pa,5Y_minus_2Y_spread_bps,10Y_minus_2Y_spread_bps,30Y_minus_2Y_spread_bps,10Y_minus_5Y_spread_bps,30Y_minus_5Y_spread_bps,30Y_minus_10Y_spread_bps"
);
assert.equal(csvRow, "2026-01-02,4.000,4.200,4.500,4.800,20.0,50.0,80.0,30.0,60.0,30.0");

const denseChartSeries = Array.from({ length: 100 }, (_, index) => ({
  date: `point-${index}`,
  value: index === 40 ? 500 : index === 60 ? -400 : index,
  nullable: index >= 70 && index <= 72 ? null : index
}));
const sampledChartSeries = sampleTimeSeriesByExtrema(denseChartSeries, ["value", "nullable"], 18);
assert.ok(sampledChartSeries.length <= 18, "Chart sampling must honor the rendering budget");
assert.equal(sampledChartSeries[0], denseChartSeries[0], "Chart sampling must retain the first observation");
assert.equal(sampledChartSeries.at(-1), denseChartSeries.at(-1), "Chart sampling must retain the last observation");
assert.ok(sampledChartSeries.includes(denseChartSeries[40]), "Chart sampling must retain positive extrema");
assert.ok(sampledChartSeries.includes(denseChartSeries[60]), "Chart sampling must retain negative extrema");
assert.ok(sampledChartSeries.some((item) => item.nullable === null), "Chart sampling must retain a source-level null gap");

const syntheticRows = [];
let syntheticCursor = new Date("2012-01-03T00:00:00Z");
const syntheticEnd = new Date("2026-07-17T00:00:00Z");
let observation = 0;
while (syntheticCursor <= syntheticEnd) {
  const day = syntheticCursor.getUTCDay();
  if (day >= 1 && day <= 5) {
    const cycle = Math.sin(observation / 31) * 0.22;
    const slowCycle = Math.cos(observation / 117) * 0.34;
    const twoYear = 3.2 + cycle + slowCycle + observation * 0.00005;
    syntheticRows.push(row(
      syntheticCursor.toISOString().slice(0, 10),
      twoYear,
      twoYear + 0.16 + Math.sin(observation / 43) * 0.05,
      twoYear + 0.38 + Math.cos(observation / 53) * 0.08,
      twoYear + 0.74 + Math.sin(observation / 71) * 0.11
    ));
    observation += 1;
  }
  syntheticCursor.setUTCDate(syntheticCursor.getUTCDate() + 1);
}

const syntheticAsOf = syntheticRows.at(-1).date;
assert.equal(syntheticAsOf, "2026-07-17");
assert.ok(estimateDnsFactors(syntheticRows.at(-1)), "A complete four-tenor curve must produce finite DNS factors");

const knownFactors = [4.5, -1.2, 0.8];
const knownDnsYields = [24, 60, 120, 360].map((maturity) => {
  const decay = 0.0609 * maturity;
  const slopeLoading = (1 - Math.exp(-decay)) / decay;
  const curvatureLoading = slopeLoading - Math.exp(-decay);
  return knownFactors[0] + slopeLoading * knownFactors[1] + curvatureLoading * knownFactors[2];
});
const recoveredFactors = estimateDnsFactors(row("2026-01-30", ...knownDnsYields));
assert.ok(recoveredFactors);
for (let index = 0; index < knownFactors.length; index += 1) {
  assert.ok(Math.abs(recoveredFactors[index] - knownFactors[index]) < 1e-9, "DNS OLS must recover a curve generated from known factors");
}

const yearEndForecast = buildYearEndForecast(syntheticRows);
assert.ok(yearEndForecast, "A sufficiently long monthly curve history should produce a year-end baseline");
assert.equal(yearEndForecast.asOfDate, syntheticAsOf);
assert.equal(yearEndForecast.targetDate, "2026-12-31");
assert.ok(yearEndForecast.diagnostics.backtestOrigins >= 70, "Rolling validation should use a substantial recent origin sample");
assert.ok(yearEndForecast.diagnostics.dnsWeightPct >= 20 && yearEndForecast.diagnostics.dnsWeightPct <= 80);
assert.equal(yearEndForecast.diagnostics.dnsWeightPct + yearEndForecast.diagnostics.randomWalkWeightPct, 100);
for (const key of ["2Y", "5Y", "10Y", "30Y"]) {
  const range = yearEndForecast.yields[key];
  assert.ok(Number.isFinite(range.median));
  assert.ok(range.low <= range.median && range.median <= range.high);
}

const weeklyResearch = buildWeeklyCurveResearch(syntheticRows, pair);
assert.ok(weeklyResearch);
assert.equal(weeklyResearch.weekStart, "2026-07-13");
assert.equal(weeklyResearch.weekEnd, "2026-07-17");
assert.ok(weeklyResearch.tableRows.every((item) => item.status === "Official CMT"));
assert.ok(weeklyResearch.tableRows.every((item) => Object.values(item.yields).every(Number.isFinite)));
assert.equal(weeklyResearch.weeklyComparisonDate, "2026-07-10", "Weekly change must disclose its prior-Friday comparison date");
assert.equal(weeklyResearch.yearEndForecast?.asOfDate, "2026-07-17", "Latest-week forecast must use the latest official as-of curve");

const priorWeeklyResearch = buildWeeklyCurveResearch(syntheticRows, pair, "2026-07-08");
assert.ok(priorWeeklyResearch);
assert.equal(priorWeeklyResearch.weekStart, "2026-07-06", "A date inside a week must normalize to Monday");
assert.equal(priorWeeklyResearch.weekEnd, "2026-07-10");
assert.equal(priorWeeklyResearch.asOf?.date, "2026-07-10", "Historical week-end must use that week's final official observation");
assert.equal(priorWeeklyResearch.weeklyComparisonDate, "2026-07-03");
assert.ok(priorWeeklyResearch.tableRows.every((item) => item.status === "Official CMT"));
assert.equal(priorWeeklyResearch.yearEndForecast?.asOfDate, "2026-07-10", "Historical forecast inputs must be truncated at the selected week");
assert.ok(priorWeeklyResearch.yearEndForecast?.trainingEndDate < "2026-07-10", "Historical forecast training must not contain later observations");

const futureWeeklyResearch = buildWeeklyCurveResearch(syntheticRows, pair, "2027-01-04");
assert.ok(futureWeeklyResearch);
assert.equal(futureWeeklyResearch.weekStart, "2026-07-13", "Future week requests must clamp to the latest available week");

const wednesdayIndex = syntheticRows.findIndex((item) => item.date === "2026-07-15");
const historyThroughWednesday = syntheticRows.slice(0, wednesdayIndex + 1);
const inProgressWeek = buildWeeklyCurveResearch(historyThroughWednesday, pair);
assert.ok(inProgressWeek);
assert.equal(inProgressWeek.tableRows[3].status, "Not yet published");
assert.equal(inProgressWeek.tableRows[4].status, "Not yet published");
assert.ok(inProgressWeek.tableRows.slice(3).every((item) => Object.values(item.yields).every((value) => value === null)), "Unpublished dates must never contain modeled yields");

const holidayRows = syntheticRows.filter((item) => item.date !== "2026-07-15");
const holidayWeek = buildWeeklyCurveResearch(holidayRows, pair);
assert.ok(holidayWeek);
assert.equal(holidayWeek.tableRows[2].status, "No official observation");
assert.ok(Object.values(holidayWeek.tableRows[2].yields).every((value) => value === null));
assert.equal(holidayWeek.tableRows[3].comparisonDate, "2026-07-14", "The next observed row must compare with the prior actual observation, not a filled holiday");

console.log(
  JSON.stringify(
    {
      classificationsVerified: expectedClassifications.length,
      completedPeriodRuleVerified: true,
      nonObservationEventRuleVerified: true,
      statisticsVerified: true,
      csvUnitsVerified: true,
      chartSamplingVerified: true,
      weeklyActualOnlyVerified: true,
      historicalWeekSelectionVerified: true,
      historicalAsOfTruncationVerified: true,
      missingObservationRuleVerified: true,
      unpublishedDatesBlankVerified: true,
      dnsRandomWalkBenchmarkVerified: true,
      rollingYearEndValidationVerified: true
    },
    null,
    2
  )
);
