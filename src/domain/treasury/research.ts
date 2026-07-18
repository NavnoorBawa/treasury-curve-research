import type { CoreCurveSpreadKey, DashboardMaturityKey, HistoricalRow, ResearchMaturityKey, SpreadKey } from "./types";

export type RangePreset = "1Y" | "5Y" | "10Y" | "20Y" | "MAX" | "CUSTOM";

export interface MacroEvent {
  id: string;
  title: string;
  category: "Crisis" | "Policy" | "Geopolitical" | "Recession" | "Market" | "Methodology";
  startDate: string;
  endDate?: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  windowBasis: string;
}

export const maturityKeys: ResearchMaturityKey[] = ["2Y", "5Y", "10Y", "30Y"];

export const coreCurveSpreadKeys: CoreCurveSpreadKey[] = ["5Y2Y", "10Y2Y", "30Y2Y", "10Y5Y", "30Y5Y", "30Y10Y"];

export const spreadKeys: SpreadKey[] = [...coreCurveSpreadKeys];

export type CurveMoveType =
  | "Bull steepening"
  | "Bear steepening"
  | "Bull flattening"
  | "Bear flattening"
  | "Parallel shift higher"
  | "Parallel shift lower";

export type CurveMoveClassification = CurveMoveType | "Neutral / unclassified";

export const curveMoveTypes: CurveMoveType[] = [
  "Bull steepening",
  "Bear steepening",
  "Bull flattening",
  "Bear flattening",
  "Parallel shift higher",
  "Parallel shift lower"
];

export type CurveMoveHorizon = "1W" | "1M";

export type CurveComparisonHorizon = CurveMoveHorizon | "3M" | "6M" | "1Y";

// CMT yields are published to the nearest basis point. A slightly wider monthly
// tolerance avoids calling a trivial slope move a directional steepener/flattener.
export const curveMoveShapeToleranceBps: Record<CurveMoveHorizon, number> = {
  "1W": 3,
  "1M": 5
};

// A calendar lookback can land on a weekend or market holiday. Ten days covers
// normal holiday clusters while preventing a labelled 1M/3M/1Y change from
// bridging a genuine source or maturity-availability gap.
export const maxLookbackObservationGapDays = 10;

export interface CurvePair {
  key: CoreCurveSpreadKey;
  label: string;
  longLabel: string;
  shortKey: DashboardMaturityKey;
  longKey: DashboardMaturityKey;
}

export interface CurveMove {
  comparisonDate: string;
  shortDeltaBps: number;
  longDeltaBps: number;
  spreadDeltaBps: number;
  levelDeltaBps: number;
  shapeToleranceBps: number;
  type: CurveMoveClassification;
  rationale: string;
}

export interface CurveRegimePoint {
  date: string;
  comparisonDate: string;
  spreadBps: number;
  shortDeltaBps: number;
  longDeltaBps: number;
  spreadDeltaBps: number;
  levelDeltaBps: number;
  shapeToleranceBps: number;
  type: CurveMoveClassification;
  rationale: string;
}

export const curvePairs: CurvePair[] = [
  { key: "5Y2Y", label: "5Y - 2Y", longLabel: "5Y minus 2Y", shortKey: "2Y", longKey: "5Y" },
  { key: "10Y2Y", label: "10Y - 2Y", longLabel: "10Y minus 2Y", shortKey: "2Y", longKey: "10Y" },
  { key: "30Y2Y", label: "30Y - 2Y", longLabel: "30Y minus 2Y", shortKey: "2Y", longKey: "30Y" },
  { key: "10Y5Y", label: "10Y - 5Y", longLabel: "10Y minus 5Y", shortKey: "5Y", longKey: "10Y" },
  { key: "30Y5Y", label: "30Y - 5Y", longLabel: "30Y minus 5Y", shortKey: "5Y", longKey: "30Y" },
  { key: "30Y10Y", label: "30Y - 10Y", longLabel: "30Y minus 10Y", shortKey: "10Y", longKey: "30Y" }
];

export const macroEvents: MacroEvent[] = [
  {
    id: "volcker",
    title: "Early-1980s disinflation window",
    category: "Policy",
    startDate: "1981-06-01",
    endDate: "1982-11-30",
    description: "Project-defined policy window spanning high-rate disinflation and the early-1980s recession.",
    sourceName: "Federal Reserve History",
    sourceUrl: "https://www.federalreservehistory.org/essays/anti-inflation-measures",
    windowBasis: "Context window; endpoints are project-defined, not a canonical cycle definition."
  },
  {
    id: "black-monday",
    title: "Black Monday",
    category: "Market",
    startDate: "1987-10-19",
    description: "Dated market disruption used as a rates-context marker.",
    sourceName: "Federal Reserve History",
    sourceUrl: "https://www.federalreservehistory.org/essays/stock-market-crash-of-1987",
    windowBasis: "Single dated event."
  },
  {
    id: "fed-1994",
    title: "1994 Fed hike cycle",
    category: "Policy",
    startDate: "1994-02-04",
    endDate: "1995-02-01",
    description: "FOMC decision-date window for the 1994 tightening cycle.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/fomc/19940204default.htm",
    windowBasis: "First and final policy-decision dates in the selected cycle."
  },
  {
    id: "asian-ltcm",
    title: "Asia/LTCM stress",
    category: "Crisis",
    startDate: "1997-07-02",
    endDate: "1998-10-15",
    description: "Composite context window covering Asian financial stress, Russia's default, and LTCM.",
    sourceName: "Federal Reserve History",
    sourceUrl: "https://www.federalreservehistory.org/essays/ltcm-near-failure",
    windowBasis: "Project-defined composite window; not a single event."
  },
  {
    id: "dot-com",
    title: "Dot-com drawdown window",
    category: "Market",
    startDate: "2000-03-10",
    endDate: "2002-10-09",
    description: "Context window anchored to the Nasdaq Composite peak and subsequent trough.",
    sourceName: "FRED / Nasdaq Composite",
    sourceUrl: "https://fred.stlouisfed.org/series/NASDAQCOM",
    windowBasis: "Equity-index anchors used only for contextual comparison; no causal claim."
  },
  {
    id: "911",
    title: "September 11 attacks",
    category: "Geopolitical",
    startDate: "2001-09-11",
    description: "Dated geopolitical event used as a rates-context marker.",
    sourceName: "National September 11 Memorial",
    sourceUrl: "https://www.911memorial.org/911-faqs",
    windowBasis: "Single dated event; chart line uses the next available CMT observation when markets are closed."
  },
  {
    id: "fed-2004",
    title: "2004-06 Fed hikes",
    category: "Policy",
    startDate: "2004-06-30",
    endDate: "2006-06-29",
    description: "FOMC decision-date window for measured-pace tightening from 1% to 5.25%.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20060629a.htm",
    windowBasis: "First and final policy-decision dates in the selected cycle."
  },
  {
    id: "gfc",
    title: "Global Financial Crisis window",
    category: "Crisis",
    startDate: "2007-08-09",
    endDate: "2009-03-09",
    description: "Project-defined context window spanning funding stress, bank failures, and extraordinary policy easing.",
    sourceName: "Federal Reserve History",
    sourceUrl: "https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath",
    windowBasis: "Project-defined crisis window; endpoints are contextual rather than canonical."
  },
  {
    id: "taper-tantrum",
    title: "Taper tantrum",
    category: "Policy",
    startDate: "2013-05-22",
    endDate: "2013-09-18",
    description: "Policy-signaling window from the May testimony through the September FOMC decision.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/newsevents/testimony/bernanke20130522a.htm",
    windowBasis: "Selected policy communication and decision dates."
  },
  {
    id: "debt-ceiling-2011",
    title: "S&P downgrade / debt-limit stress",
    category: "Policy",
    startDate: "2011-08-05",
    endDate: "2011-08-08",
    description: "Post-debt-limit context window beginning with the U.S. sovereign downgrade.",
    sourceName: "U.S. Government Accountability Office",
    sourceUrl: "https://www.gao.gov/products/gao-12-701",
    windowBasis: "Downgrade and immediate market-response dates; not the full debt-limit negotiation."
  },
  {
    id: "fed-2015",
    title: "2015-18 Fed hikes",
    category: "Policy",
    startDate: "2015-12-16",
    endDate: "2018-12-19",
    description: "FOMC decision-date window from the first post-GFC increase through December 2018.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20151216a.htm",
    windowBasis: "First and final policy-decision dates in the selected cycle."
  },
  {
    id: "tariffs-2018",
    title: "U.S.-China tariff shock",
    category: "Geopolitical",
    startDate: "2018-03-22",
    endDate: "2019-08-01",
    description: "Project-defined trade-policy escalation window used for rates context.",
    sourceName: "White House archive",
    sourceUrl: "https://trumpwhitehouse.archives.gov/presidential-actions/presidential-memorandum-actions-united-states-related-section-301-investigation/",
    windowBasis: "Selected policy-announcement endpoints; no single-cause claim."
  },
  {
    id: "repo-2019",
    title: "Repo market stress",
    category: "Market",
    startDate: "2019-09-17",
    description: "Dated short-term funding disruption used as a rates-context marker.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/monetarypolicy/bsd-monetary-policy-tools-201911.htm",
    windowBasis: "Single dated funding-market onset marker."
  },
  {
    id: "covid",
    title: "COVID market-policy response window",
    category: "Crisis",
    startDate: "2020-02-19",
    endDate: "2020-04-09",
    description: "Project-defined window spanning the initial market break and emergency policy response.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/publications/2020-monetary-policy.htm",
    windowBasis: "Selected market and policy anchors; not a pandemic onset definition."
  },
  {
    id: "treasury-methodology-2021",
    title: "Treasury curve-method change",
    category: "Methodology",
    startDate: "2021-12-06",
    description: "Treasury began its monotone-convex method. Earlier quasi-cubic Hermite rates remain official.",
    sourceName: "U.S. Treasury",
    sourceUrl: "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology",
    windowBasis: "Official methodology effective date."
  },
  {
    id: "russia-ukraine",
    title: "Russia-Ukraine war",
    category: "Geopolitical",
    startDate: "2022-02-24",
    description: "Dated geopolitical event used as a rates-context marker.",
    sourceName: "United Nations",
    sourceUrl: "https://press.un.org/en/2022/sc14803.doc.htm",
    windowBasis: "Single dated invasion marker; no single-cause market claim."
  },
  {
    id: "fed-2022",
    title: "2022-23 Fed hike cycle",
    category: "Policy",
    startDate: "2022-03-16",
    endDate: "2023-07-26",
    description: "FOMC decision-date window from a 0%-0.25% target range to 5.25%-5.50%.",
    sourceName: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20230726a.htm",
    windowBasis: "First and final policy-decision dates in the selected cycle."
  },
  {
    id: "svb",
    title: "Regional banking crisis",
    category: "Crisis",
    startDate: "2023-03-10",
    endDate: "2023-05-01",
    description: "Project-defined window from SVB's failure through First Republic's resolution.",
    sourceName: "FDIC",
    sourceUrl: "https://www.fdic.gov/resources/resolutions/bank-failures/failed-bank-list/silicon-valley.html",
    windowBasis: "Official bank-failure dates used as window endpoints."
  },
  {
    id: "tariffs-2025",
    title: "2025 tariff announcements",
    category: "Geopolitical",
    startDate: "2025-04-02",
    description: "Dated trade-policy announcement used as a rates-context marker.",
    sourceName: "White House",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/2025/04/regulating-imports-with-a-reciprocal-tariff-to-rectify-trade-practices-that-contribute-to-large-and-persistent-annual-united-states-goods-trade-deficits/",
    windowBasis: "Single official announcement date; no causal attribution."
  }
];

export const rangePresetLabels: Record<RangePreset, string> = {
  "1Y": "1Y",
  "5Y": "5Y",
  "10Y": "10Y",
  "20Y": "20Y",
  MAX: "Max",
  CUSTOM: "Custom"
};

const addYears = (date: Date, years: number) => {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const isoToDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const getComparisonTargetDate = (date: string, horizon: CurveComparisonHorizon) => {
  const value = isoToDate(date);
  if (horizon === "1W") return toIsoDate(addDays(value, -7));
  if (horizon === "1M") return toIsoDate(addMonths(value, -1));
  if (horizon === "3M") return toIsoDate(addMonths(value, -3));
  if (horizon === "6M") return toIsoDate(addMonths(value, -6));
  return toIsoDate(addYears(value, -1));
};

export const getPresetRange = (preset: Exclude<RangePreset, "CUSTOM">, rows: HistoricalRow[]) => {
  const first = rows[0]?.date ?? "";
  const last = rows.at(-1)?.date ?? "";
  if (!first || !last) return { start: "", end: "" };
  if (preset === "MAX") return { start: first, end: last };

  const years = Number(preset.replace("Y", ""));
  const targetStart = toIsoDate(addYears(isoToDate(last), -years));
  const start = rows.find((row) => row.date >= targetStart)?.date ?? first;

  return {
    start,
    end: last
  };
};

export const getEventFocusRange = (event: MacroEvent, rows: HistoricalRow[]) => {
  const first = rows[0]?.date ?? event.startDate;
  const last = rows.at(-1)?.date ?? event.endDate ?? event.startDate;
  const targetStart = toIsoDate(addMonths(isoToDate(event.startDate), -12));
  const targetEnd = toIsoDate(addMonths(isoToDate(event.endDate ?? event.startDate), 18));
  const boundedStart = targetStart < first ? first : targetStart;
  const boundedEnd = targetEnd > last ? last : targetEnd;
  const start = rows.find((row) => row.date >= boundedStart)?.date ?? first;
  const end = [...rows].reverse().find((row) => row.date <= boundedEnd)?.date ?? last;

  return { start, end };
};

export const filterRowsByRange = (rows: HistoricalRow[], start: string, end: string) =>
  rows.filter((row) => row.date >= start && row.date <= end);

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvYield = (value: number | null | undefined) =>
  value === null || value === undefined || Number.isNaN(value) ? "" : value.toFixed(3);

const csvBps = (value: number | null | undefined) =>
  value === null || value === undefined || Number.isNaN(value) ? "" : value.toFixed(1);

export const buildTreasuryCurveCsv = (rows: HistoricalRow[]) => {
  const headers = [
    "date",
    ...maturityKeys.map((key) => `${key}_yield_pct_pa`),
    ...curvePairs.map((pair) => `${pair.longKey}_minus_${pair.shortKey}_spread_bps`)
  ];
  const body = rows.map((row) => [
    row.date,
    ...maturityKeys.map((key) => csvYield(row[key])),
    ...curvePairs.map((pair) => csvBps(row[pair.key]))
  ]);

  return [headers.map(csvEscape).join(","), ...body.map((cells) => cells.map(csvEscape).join(","))].join("\n");
};

export const eventsInRange = (start: string, end: string) =>
  macroEvents.filter((event) => {
    const eventEnd = event.endDate ?? event.startDate;
    return event.startDate <= end && eventEnd >= start;
  });

export const getEventMarkerDate = (event: MacroEvent, rows: HistoricalRow[], start: string, end: string) => {
  if (event.startDate < start || event.startDate > end) return null;
  return rows.find((row) => row.date >= event.startDate && row.date <= end)?.date ?? null;
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const hasPairValues = (row: HistoricalRow, pair: CurvePair) => isNumber(row[pair.shortKey]) && isNumber(row[pair.longKey]);

const hasCompleteCurve = (row: HistoricalRow) => maturityKeys.every((key) => isNumber(row[key]));

export const currentSpreadForPair = (row: HistoricalRow, pair: CurvePair) => {
  const storedSpread = row[pair.key];
  if (isNumber(storedSpread)) return storedSpread;

  const longYield = row[pair.longKey];
  const shortYield = row[pair.shortKey];
  return isNumber(longYield) && isNumber(shortYield) ? (longYield - shortYield) * 100 : null;
};

export const classifyCurveMove = (
  spreadDeltaBps: number,
  levelDeltaBps: number,
  shapeToleranceBps = curveMoveShapeToleranceBps["1W"]
): CurveMoveClassification => {
  if (levelDeltaBps === 0) return "Neutral / unclassified";

  if (Math.abs(spreadDeltaBps) <= shapeToleranceBps) {
    return levelDeltaBps > 0 ? "Parallel shift higher" : "Parallel shift lower";
  }

  if (spreadDeltaBps > 0) {
    return levelDeltaBps > 0 ? "Bear steepening" : "Bull steepening";
  }

  return levelDeltaBps > 0 ? "Bear flattening" : "Bull flattening";
};

export const movementRationale = (type: CurveMoveClassification, pair: CurvePair, levelDeltaBps?: number) => {
  const segment = `${pair.longKey}/${pair.shortKey}`;

  if (type === "Neutral / unclassified" || levelDeltaBps === 0) {
    return `${segment} had an exactly zero pair-average yield change. Bull/bear direction is indeterminate, so this observation is excluded from the six directional regime counts.`;
  }

  switch (type) {
    case "Bear steepening":
      return `${segment} steepened while the pair's average yield level rose. This is consistent with more upward repricing at the long tenor than the front tenor, but does not identify a single economic cause.`;
    case "Bull steepening":
      return `${segment} steepened while the pair's average yield level fell. This is consistent with the front tenor rallying faster, but does not identify a single economic cause.`;
    case "Bear flattening":
      return `${segment} flattened while the pair's average yield level rose. This is consistent with more upward repricing at the front tenor, but does not identify a single economic cause.`;
    case "Bull flattening":
      return `${segment} flattened while the pair's average yield level fell. This is consistent with the long tenor rallying faster, but does not identify a single economic cause.`;
    case "Parallel shift higher":
      return `${segment} moved near-parallel with yields higher. The pair's slope change remained inside the stated classification tolerance.`;
    case "Parallel shift lower":
      return `${segment} moved near-parallel with yields lower. The pair's slope change remained inside the stated classification tolerance.`;
  }
};

const lastIndexOnOrBefore = (rows: HistoricalRow[], targetDate: string) => {
  let lower = 0;
  let upper = rows.length - 1;
  let candidate = -1;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (rows[middle].date <= targetDate) {
      candidate = middle;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  return candidate;
};

const isWithinObservationGap = (candidateDate: string, targetDate: string, maxCalendarDays = maxLookbackObservationGapDays) => {
  const candidate = isoToDate(candidateDate).getTime();
  const target = isoToDate(targetDate).getTime();
  return (target - candidate) / 86_400_000 <= maxCalendarDays;
};

export const findPairObservationOnOrBefore = (rows: HistoricalRow[], pair: CurvePair, targetDate: string) => {
  for (let index = lastIndexOnOrBefore(rows, targetDate); index >= 0; index -= 1) {
    if (hasPairValues(rows[index], pair)) {
      return isWithinObservationGap(rows[index].date, targetDate) ? rows[index] : null;
    }
  }

  return null;
};

export const findCompleteCurveObservationOnOrBefore = (rows: HistoricalRow[], targetDate: string) => {
  for (let index = lastIndexOnOrBefore(rows, targetDate); index >= 0; index -= 1) {
    if (hasCompleteCurve(rows[index])) {
      return isWithinObservationGap(rows[index].date, targetDate) ? rows[index] : null;
    }
  }

  return null;
};

export const buildCurveMove = (
  reference: HistoricalRow,
  asOf: HistoricalRow,
  pair: CurvePair,
  shapeToleranceBps = curveMoveShapeToleranceBps["1W"]
): CurveMove | null => {
  const currentLong = asOf[pair.longKey];
  const currentShort = asOf[pair.shortKey];
  const currentSpread = currentSpreadForPair(asOf, pair);
  const priorLong = reference[pair.longKey];
  const priorShort = reference[pair.shortKey];
  const priorSpread = currentSpreadForPair(reference, pair);

  if (
    !isNumber(currentLong) ||
    !isNumber(currentShort) ||
    !isNumber(currentSpread) ||
    !isNumber(priorLong) ||
    !isNumber(priorShort) ||
    !isNumber(priorSpread)
  ) {
    return null;
  }

  const roundBps = (value: number) => Math.round(value * 10) / 10;
  const longDeltaBps = roundBps((currentLong - priorLong) * 100);
  const shortDeltaBps = roundBps((currentShort - priorShort) * 100);
  const spreadDeltaBps = roundBps(currentSpread - priorSpread);
  const levelDeltaBps = roundBps((longDeltaBps + shortDeltaBps) / 2);
  const type = classifyCurveMove(spreadDeltaBps, levelDeltaBps, shapeToleranceBps);

  return {
    comparisonDate: reference.date,
    shortDeltaBps,
    longDeltaBps,
    spreadDeltaBps,
    levelDeltaBps,
    shapeToleranceBps,
    type,
    rationale: movementRationale(type, pair, levelDeltaBps)
  };
};

export const buildCurveMoveForDates = (
  rows: HistoricalRow[],
  pair: CurvePair,
  asOfDate: string,
  referenceDate: string,
  shapeToleranceBps = curveMoveShapeToleranceBps["1W"]
) => {
  const asOf = findPairObservationOnOrBefore(rows, pair, asOfDate);
  const reference = findPairObservationOnOrBefore(rows, pair, referenceDate);

  if (!asOf || !reference || reference.date >= asOf.date) return null;
  return buildCurveMove(reference, asOf, pair, shapeToleranceBps);
};

const calendarPeriodKey = (date: string, horizon: CurveMoveHorizon) => {
  const value = isoToDate(date);

  if (horizon === "1M") {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const mondayOffset = (value.getUTCDay() + 6) % 7;
  return toIsoDate(addDays(value, -mondayOffset));
};

const isTerminalPeriodComplete = (date: string, horizon: CurveMoveHorizon) => {
  const value = isoToDate(date);

  if (horizon === "1W") return value.getUTCDay() === 5;

  const lastWeekday = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  while (lastWeekday.getUTCDay() === 0 || lastWeekday.getUTCDay() === 6) {
    lastWeekday.setUTCDate(lastWeekday.getUTCDate() - 1);
  }

  return toIsoDate(lastWeekday) === date;
};

const intervalIsPlausiblyContinuous = (referenceDate: string, asOfDate: string, horizon: CurveMoveHorizon) => {
  const elapsedDays = (isoToDate(asOfDate).getTime() - isoToDate(referenceDate).getTime()) / 86_400_000;
  return elapsedDays > 0 && elapsedDays <= (horizon === "1W" ? 11 : 45);
};

export const buildCurveRegimeTimeline = (
  rows: HistoricalRow[],
  pair: CurvePair,
  startDate: string,
  endDate: string,
  horizon: CurveMoveHorizon,
  toleranceBps = curveMoveShapeToleranceBps[horizon]
): CurveRegimePoint[] => {
  // Regime labels describe non-overlapping calendar periods, not a rolling label for
  // every daily observation. This preserves the interpretation of a weekly/monthly move.
  const periodEnds = new Map<string, HistoricalRow>();

  rows
    .filter((row) => hasPairValues(row, pair))
    .forEach((row) => periodEnds.set(calendarPeriodKey(row.date, horizon), row));

  const anchors = [...periodEnds.values()].sort((left, right) => left.date.localeCompare(right.date));
  const terminalAnchorIndex = anchors.length - 1;
  const shapeToleranceBps = toleranceBps;

  return anchors.flatMap((asOf, index) => {
    const reference = anchors[index - 1];
    const isUnfinishedTerminalPeriod = index === terminalAnchorIndex && !isTerminalPeriodComplete(asOf.date, horizon);

    if (
      !reference ||
      reference.date < startDate ||
      asOf.date < startDate ||
      asOf.date > endDate ||
      isUnfinishedTerminalPeriod ||
      !intervalIsPlausiblyContinuous(reference.date, asOf.date, horizon)
    ) {
      return [];
    }

    const move = buildCurveMove(reference, asOf, pair, shapeToleranceBps);
    const spreadBps = currentSpreadForPair(asOf, pair);

    return move && isNumber(spreadBps)
      ? [
          {
            date: asOf.date,
            comparisonDate: move.comparisonDate,
            spreadBps,
            shortDeltaBps: move.shortDeltaBps,
            longDeltaBps: move.longDeltaBps,
            spreadDeltaBps: move.spreadDeltaBps,
            levelDeltaBps: move.levelDeltaBps,
            shapeToleranceBps: move.shapeToleranceBps,
            type: move.type,
            rationale: move.rationale
          }
        ]
      : [];
  });
};

const mean = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const std = (values: number[]) => {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const valueChangeMonths = (
  referenceRows: HistoricalRow[],
  last: HistoricalRow | undefined,
  key: ResearchMaturityKey,
  lookbackMonths: number
) => {
  if (!last || typeof last[key] !== "number") return null;

  const target = toIsoDate(addMonths(isoToDate(last.date), -lookbackMonths));
  const prior = [...referenceRows]
    .reverse()
    .find((row) => row.date <= target && typeof row[key] === "number");

  if (!prior || typeof prior[key] !== "number" || !isWithinObservationGap(prior.date, target)) {
    return null;
  }

  return Math.round((last[key] - prior[key]) * 1000) / 10;
};

export const buildStats = (rows: HistoricalRow[], referenceRows = rows) =>
  maturityKeys.map((key) => {
    const values = rows
      .map((row) => row[key])
      .filter((value): value is number => typeof value === "number");

    const changes = rows
      .map((row, index) => {
        if (index === 0) return null;
        const current = row[key];
        const prior = rows[index - 1][key];
        return typeof current === "number" && typeof prior === "number" ? (current - prior) * 100 : null;
      })
      .filter((value): value is number => typeof value === "number");

    const latestObservation = [...rows].reverse().find((row) => isNumber(row[key]));
    const latest = latestObservation && isNumber(latestObservation[key]) ? latestObservation[key] : null;
    const valuesBelow = latest === null ? 0 : values.filter((value) => value <= latest).length;

    return {
      key,
      latest,
      latestObservationDate: latestObservation?.date ?? null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      average: mean(values),
      annualizedVolBps: (() => {
        const dailyVol = std(changes);
        return dailyVol === null ? null : dailyVol * Math.sqrt(252);
      })(),
      oneMonthChangeBps: valueChangeMonths(referenceRows, latestObservation, key, 1),
      threeMonthChangeBps: valueChangeMonths(referenceRows, latestObservation, key, 3),
      oneYearChangeBps: valueChangeMonths(referenceRows, latestObservation, key, 12),
      percentile: values.length && latest !== null ? (valuesBelow / values.length) * 100 : null,
      observations: values.length
    };
  });
