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
  asOf: HistoricalRow;
  pair: CurvePair;
  weekStart: string;
  weekEnd: string;
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

const completeCurveRows = (rows: HistoricalRow[]) =>
  rows
    .filter((row) => maturityKeys.every((key) => isNumber(row[key])))
    .sort((left, right) => left.date.localeCompare(right.date));

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfWeek = (date: string) => {
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
  suppliedYearEndForecast?: YearEndForecast | null
): WeeklyCurveResearch | null => {
  const rows = completeCurveRows(sourceRows);
  const asOf = rows.at(-1);
  if (!asOf) return null;

  const weekStart = startOfWeek(asOf.date);
  const weekDates = weekdayDates(weekStart);
  const weekEnd = weekDates.at(-1) ?? weekStart;
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const tableRows = weekDates.map((date): WeeklyDeskRow => {
    const observed = rowsByDate.get(date) ?? null;
    const reference = observed ? lastRowBefore(rows, date) : null;
    const move = observed && reference
      ? buildCurveMove(reference, observed, pair, DAILY_REGIME_TOLERANCE_BPS)
      : null;
    const status: WeeklyRowStatus = observed
      ? "Official CMT"
      : date <= asOf.date
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
      spreadBps: observed ? currentSpreadForPair(observed, pair) : null,
      levelDeltaBps: move?.levelDeltaBps ?? null,
      spreadDeltaBps: move?.spreadDeltaBps ?? null,
      regime: move?.type ?? null,
      comparisonDate: move?.comparisonDate ?? null
    };
  });

  const weeklyReference = lastRowBefore(rows, weekStart);
  const weeklyMove = weeklyReference
    ? buildCurveMove(weeklyReference, asOf, pair, WEEKLY_REGIME_TOLERANCE_BPS)
    : null;
  const yearStart = previousYearEndRow(rows, asOf);
  const yearToDateMove = yearStart
    ? buildCurveMove(yearStart, asOf, pair, YEAR_END_REGIME_TOLERANCE_BPS)
    : null;
  const yearEndForecast = suppliedYearEndForecast === undefined
    ? buildYearEndForecast(rows)
    : suppliedYearEndForecast;
  const yearEndMove = yearEndForecast
    ? buildCurveMove(asOf, rowFromYearEndForecast(yearEndForecast), pair, YEAR_END_REGIME_TOLERANCE_BPS)
    : null;

  return {
    asOf,
    pair,
    weekStart,
    weekEnd,
    tableRows,
    weeklyMove,
    weeklyComparisonDate: weeklyReference?.date ?? null,
    currentSpreadBps: currentSpreadForPair(asOf, pair),
    yearToDateMove,
    yearToDateStart: yearStart?.date ?? null,
    yearEndMove,
    yearEndForecast,
    yearEndRationale: yearEndMove
      ? `${movementRationale(yearEndMove.type, pair, yearEndMove.levelDeltaBps)} ${conditionalRegimeInterpretation(yearEndMove.type, pair)}`
      : null
  };
};
