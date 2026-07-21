import {
  buildCurveMove,
  currentSpreadForPair,
  isoToDate,
  maturityKeys,
  movementRationale,
  toIsoDate,
  type CurveMove,
  type CurveMoveClassification,
  type CurvePair
} from "./research.ts";
import type { HistoricalRow, ResearchMaturityKey } from "./types";
import {
  buildYearEndForecast,
  type YearEndForecast
} from "./yearEndForecast.ts";

export const DAILY_REGIME_TOLERANCE_BPS = 1;
export const WEEKLY_REGIME_TOLERANCE_BPS = 3;
export const YEAR_END_REGIME_TOLERANCE_BPS = 10;

export type WeeklyRowStatus = "Official CMT" | "No official observation" | "Not yet published";

export interface WeeklyDeskRow {
  date: string;
  day: string;
  status: WeeklyRowStatus;
  yields: Record<ResearchMaturityKey, number | null>;
  spreadBps: number | null;
  levelDeltaBps: number | null;
  spreadDeltaBps: number | null;
  regime: CurveMoveClassification | null;
  comparisonDate: string | null;
}

export interface WeeklyCurveResearch {
  asOf: HistoricalRow | null;
  pair: CurvePair;
  weekStart: string;
  weekEnd: string;
  earliestWeekStart: string;
  latestWeekStart: string;
  latestAvailableDate: string;
  tableRows: WeeklyDeskRow[];
  weeklyMove: CurveMove | null;
  weeklyComparisonDate: string | null;
  currentSpreadBps: number | null;
  yearToDateMove: CurveMove | null;
  yearToDateStart: string | null;
  yearEndMove: CurveMove | null;
  yearEndForecast: YearEndForecast | null;
  yearEndRationale: string | null;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const startOfTreasuryWeek = (date: string) => {
  const value = isoToDate(date);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  return toIsoDate(addDays(value, -mondayOffset));
};

const weekdayDates = (monday: string) =>
  Array.from({ length: 5 }, (_, index) => toIsoDate(addDays(isoToDate(monday), index)));

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(isoToDate(date));

const lastRowBefore = (rows: HistoricalRow[], date: string) =>
  [...rows].reverse().find((row) => row.date < date) ?? null;

const rowSupportsPair = (row: HistoricalRow, pair: CurvePair) =>
  isNumber(row[pair.shortKey]) && isNumber(row[pair.longKey]);

const isIsoDate = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const getWeeklySelectionBounds = (sourceRows: HistoricalRow[], pair: CurvePair) => {
  const pairRows = sourceRows
    .filter((row) => rowSupportsPair(row, pair))
    .sort((left, right) => left.date.localeCompare(right.date));
  const first = pairRows[0];
  const last = pairRows.at(-1);
  if (!first || !last) return null;
  return {
    earliestWeekStart: startOfTreasuryWeek(first.date),
    latestWeekStart: startOfTreasuryWeek(last.date)
  };
};

export const normalizeWeeklyWeekStart = (
  sourceRows: HistoricalRow[],
  pair: CurvePair,
  requestedWeekStart?: string | null
) => {
  const bounds = getWeeklySelectionBounds(sourceRows, pair);
  if (!bounds) return null;
  if (!isIsoDate(requestedWeekStart)) return bounds.latestWeekStart;
  const normalized = startOfTreasuryWeek(requestedWeekStart);
  if (normalized < bounds.earliestWeekStart) return bounds.earliestWeekStart;
  if (normalized > bounds.latestWeekStart) return bounds.latestWeekStart;
  return normalized;
};

const previousYearEndRow = (rows: HistoricalRow[], asOf: HistoricalRow) => {
  const previousYear = isoToDate(asOf.date).getUTCFullYear() - 1;
  return [...rows].reverse().find((row) => isoToDate(row.date).getUTCFullYear() === previousYear) ?? null;
};

const rowFromYearEndForecast = (forecast: YearEndForecast): HistoricalRow => {
  const row = {
    date: forecast.targetDate,
    "2Y": forecast.yields["2Y"].median,
    "5Y": forecast.yields["5Y"].median,
    "10Y": forecast.yields["10Y"].median,
    "30Y": forecast.yields["30Y"].median
  } as HistoricalRow;
  row["5Y2Y"] = (Number(row["5Y"]) - Number(row["2Y"])) * 100;
  row["10Y2Y"] = (Number(row["10Y"]) - Number(row["2Y"])) * 100;
  row["30Y2Y"] = (Number(row["30Y"]) - Number(row["2Y"])) * 100;
  row["10Y5Y"] = (Number(row["10Y"]) - Number(row["5Y"])) * 100;
  row["30Y5Y"] = (Number(row["30Y"]) - Number(row["5Y"])) * 100;
  row["30Y10Y"] = (Number(row["30Y"]) - Number(row["10Y"])) * 100;
  return row;
};

export const conditionalRegimeInterpretation = (type: CurveMoveClassification, pair: CurvePair) => {
  const segment = pair.label.replace(" - ", "/");
  switch (type) {
    case "Bull steepening":
      return `${segment} front-end yields fall faster than long-end yields. This can be consistent with easing expectations while term premium or inflation risk limits the long-end rally.`;
    case "Bear steepening":
      return `${segment} long-end yields rise faster than front-end yields. This can be consistent with higher term premium, inflation compensation, or duration supply concerns.`;
    case "Bull flattening":
      return `${segment} long-end yields fall faster than front-end yields. This can be consistent with weaker growth expectations, disinflation, or defensive duration demand.`;
    case "Bear flattening":
      return `${segment} front-end yields rise faster than long-end yields. This can be consistent with tighter policy-path repricing while longer-run expectations move less.`;
    case "Parallel shift higher":
      return `${segment} yields rise with little net slope change. The move is broad across the selected pair rather than primarily a curve-shape signal.`;
    case "Parallel shift lower":
      return `${segment} yields fall with little net slope change. The move is broad across the selected pair rather than primarily a curve-shape signal.`;
    default:
      return `${segment} has no directional six-regime label because the pair-average move is exactly zero.`;
  }
};

export const buildWeeklyCurveResearch = (
  sourceRows: HistoricalRow[],
  pair: CurvePair,
  selectedWeekStart?: string | null,
  suppliedYearEndForecast?: YearEndForecast | null
): WeeklyCurveResearch | null => {
  const rows = [...sourceRows].sort((left, right) => left.date.localeCompare(right.date));
  const pairRows = rows.filter((row) => rowSupportsPair(row, pair));
  const bounds = getWeeklySelectionBounds(pairRows, pair);
  const latestAvailableDate = rows.at(-1)?.date;
  if (!bounds || !latestAvailableDate) return null;

  const weekStart = normalizeWeeklyWeekStart(pairRows, pair, selectedWeekStart);
  if (!weekStart) return null;
  const weekDates = weekdayDates(weekStart);
  const weekEnd = weekDates.at(-1) ?? weekStart;
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const asOf = pairRows.filter((row) => row.date >= weekStart && row.date <= weekEnd).at(-1) ?? null;
  const tableRows = weekDates.map((date): WeeklyDeskRow => {
    const observed = rowsByDate.get(date) ?? null;
    const pairObservation = observed && rowSupportsPair(observed, pair) ? observed : null;
    const reference = pairObservation ? lastRowBefore(pairRows, date) : null;
    const move = pairObservation && reference
      ? buildCurveMove(reference, pairObservation, pair, DAILY_REGIME_TOLERANCE_BPS)
      : null;
    const status: WeeklyRowStatus = observed
      ? "Official CMT"
      : date <= latestAvailableDate
        ? "No official observation"
        : "Not yet published";

    return {
      date,
      day: dayLabel(date),
      status,
      yields: Object.fromEntries(maturityKeys.map((key) => [
        key,
        observed && isNumber(observed[key]) ? Number(observed[key]) : null
      ])) as Record<ResearchMaturityKey, number | null>,
      spreadBps: pairObservation ? currentSpreadForPair(pairObservation, pair) : null,
      levelDeltaBps: move?.levelDeltaBps ?? null,
      spreadDeltaBps: move?.spreadDeltaBps ?? null,
      regime: move?.type ?? null,
      comparisonDate: move?.comparisonDate ?? null
    };
  });

  const weeklyReference = lastRowBefore(pairRows, weekStart);
  const weeklyMove = weeklyReference && asOf
    ? buildCurveMove(weeklyReference, asOf, pair, WEEKLY_REGIME_TOLERANCE_BPS)
    : null;
  const yearStart = asOf ? previousYearEndRow(pairRows, asOf) : null;
  const yearToDateMove = yearStart && asOf
    ? buildCurveMove(yearStart, asOf, pair, YEAR_END_REGIME_TOLERANCE_BPS)
    : null;
  const rowsThroughAsOf = asOf ? rows.filter((row) => row.date <= asOf.date) : [];
  const asOfHasCompleteCurve = asOf ? maturityKeys.every((key) => isNumber(asOf[key])) : false;
  const yearEndForecast = asOfHasCompleteCurve
    ? suppliedYearEndForecast && suppliedYearEndForecast.asOfDate === asOf?.date
      ? suppliedYearEndForecast
      : buildYearEndForecast(rowsThroughAsOf)
    : null;
  const yearEndMove = yearEndForecast && asOf
    ? buildCurveMove(asOf, rowFromYearEndForecast(yearEndForecast), pair, YEAR_END_REGIME_TOLERANCE_BPS)
    : null;

  return {
    asOf,
    pair,
    weekStart,
    weekEnd,
    earliestWeekStart: bounds.earliestWeekStart,
    latestWeekStart: bounds.latestWeekStart,
    latestAvailableDate,
    tableRows,
    weeklyMove,
    weeklyComparisonDate: weeklyReference?.date ?? null,
    currentSpreadBps: asOf ? currentSpreadForPair(asOf, pair) : null,
    yearToDateMove,
    yearToDateStart: yearStart?.date ?? null,
    yearEndMove,
    yearEndForecast,
    yearEndRationale: yearEndMove
      ? `${movementRationale(yearEndMove.type, pair, yearEndMove.levelDeltaBps)} ${conditionalRegimeInterpretation(yearEndMove.type, pair)}`
      : null
  };
};
