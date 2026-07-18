import { maturityKeys } from "./research.ts";
import type { HistoricalRow, ResearchMaturityKey } from "./types";

export const DNS_DECAY_PER_MONTH = 0.0609;
export const YEAR_END_TRAINING_MONTHS = 240;
export const YEAR_END_BACKTEST_ORIGINS = 84;

const MIN_TRAINING_MONTHS = 60;
const MIN_INTERVAL_ORIGINS = 12;
const MIN_MODEL_WEIGHT = 0.2;
const MAX_MODEL_WEIGHT = 0.8;
const MATURITY_MONTHS: Record<ResearchMaturityKey, number> = {
  "2Y": 24,
  "5Y": 60,
  "10Y": 120,
  "30Y": 360
};

export interface YearEndForecastRange {
  low: number;
  median: number;
  high: number;
}

export interface YearEndForecastDiagnostics {
  backtestOrigins: number;
  dnsMaeBps: number | null;
  randomWalkMaeBps: number | null;
  ensembleMaeBps: number | null;
  empiricalBandCoveragePct: number | null;
  coverageObservations: number;
  dnsWeightPct: number;
  randomWalkWeightPct: number;
}

export interface YearEndForecast {
  asOfDate: string;
  targetDate: string;
  horizonMonths: number;
  yields: Record<ResearchMaturityKey, YearEndForecastRange>;
  dnsPointYields: Record<ResearchMaturityKey, number>;
  randomWalkYields: Record<ResearchMaturityKey, number>;
  trainingStartDate: string;
  trainingEndDate: string;
  diagnostics: YearEndForecastDiagnostics;
}

type DnsFactors = [number, number, number];

interface BacktestObservation {
  dnsErrorsBps: Record<ResearchMaturityKey, number>;
  randomWalkErrorsBps: Record<ResearchMaturityKey, number>;
  ensembleResidualsBps: Record<ResearchMaturityKey, number>;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const quantile = (values: number[], probability: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const completeCurveRows = (rows: HistoricalRow[]) =>
  rows
    .filter((row) => maturityKeys.every((key) => isNumber(row[key])))
    .sort((left, right) => left.date.localeCompare(right.date));

const monthOrdinal = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return year * 12 + month - 1;
};

const monthEndRows = (rows: HistoricalRow[]) => {
  const byMonth = new Map<string, HistoricalRow>();
  for (const row of completeCurveRows(rows)) byMonth.set(row.date.slice(0, 7), row);
  return [...byMonth.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const contiguousMonthlyTail = (rows: HistoricalRow[]) => {
  if (!rows.length) return [];
  let start = rows.length - 1;
  while (start > 0 && monthOrdinal(rows[start].date) - monthOrdinal(rows[start - 1].date) === 1) start -= 1;
  return rows.slice(start);
};

const monthsToTarget = (asOfDate: string, targetDate: string) => {
  const milliseconds = Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`);
  const averageMonthMilliseconds = (365.2425 / 12) * 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round(milliseconds / averageMonthMilliseconds));
};

const dnsLoading = (maturityMonths: number): DnsFactors => {
  const decay = DNS_DECAY_PER_MONTH * maturityMonths;
  const slope = (1 - Math.exp(-decay)) / decay;
  return [1, slope, slope - Math.exp(-decay)];
};

const DNS_LOADINGS = maturityKeys.map((key) => dnsLoading(MATURITY_MONTHS[key]));

const solveThreeByThree = (matrix: number[][], vector: number[]): DnsFactors | null => {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    for (let item = column; item < 4; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item < 4; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return [augmented[0][3], augmented[1][3], augmented[2][3]];
};

export const estimateDnsFactors = (row: HistoricalRow): DnsFactors | null => {
  if (maturityKeys.some((key) => !isNumber(row[key]))) return null;
  const yields = maturityKeys.map((key) => Number(row[key]));
  const xtx = Array.from({ length: 3 }, (_, left) =>
    Array.from({ length: 3 }, (_, right) =>
      DNS_LOADINGS.reduce((sum, loading) => sum + loading[left] * loading[right], 0)
    )
  );
  const xty = Array.from({ length: 3 }, (_, column) =>
    DNS_LOADINGS.reduce((sum, loading, index) => sum + loading[column] * yields[index], 0)
  );
  return solveThreeByThree(xtx, xty);
};

const yieldsFromFactors = (factors: DnsFactors) =>
  Object.fromEntries(maturityKeys.map((key, index) => [
    key,
    DNS_LOADINGS[index].reduce((sum, loading, factorIndex) => sum + loading * factors[factorIndex], 0)
  ])) as Record<ResearchMaturityKey, number>;

const fitArOne = (values: number[]) => {
  const lagged = values.slice(0, -1);
  const current = values.slice(1);
  const laggedMean = mean(lagged);
  const currentMean = mean(current);
  const denominator = lagged.reduce((sum, value) => sum + (value - laggedMean) ** 2, 0);
  const rawPersistence = denominator > 1e-12
    ? lagged.reduce((sum, value, index) => sum + (value - laggedMean) * (current[index] - currentMean), 0) / denominator
    : 0;
  const persistence = clamp(rawPersistence, -0.995, 0.995);
  return { intercept: currentMean - persistence * laggedMean, persistence };
};

const forecastDns = (trainingRows: HistoricalRow[], origin: HistoricalRow, horizonMonths: number) => {
  const factorHistory = trainingRows
    .map(estimateDnsFactors)
    .filter((factors): factors is DnsFactors => factors !== null);
  const originFactors = estimateDnsFactors(origin);
  if (!originFactors || factorHistory.length < MIN_TRAINING_MONTHS) return null;

  const models = Array.from({ length: 3 }, (_, index) => fitArOne(factorHistory.map((factors) => factors[index])));
  const forecast = [...originFactors] as DnsFactors;
  for (let step = 0; step < horizonMonths; step += 1) {
    for (let factor = 0; factor < 3; factor += 1) {
      forecast[factor] = models[factor].intercept + models[factor].persistence * forecast[factor];
    }
  }
  return yieldsFromFactors(forecast);
};

const modelWeight = (dnsAbsoluteErrors: number[], randomWalkAbsoluteErrors: number[]) => {
  if (!dnsAbsoluteErrors.length || !randomWalkAbsoluteErrors.length) return 0.5;
  const dnsMae = mean(dnsAbsoluteErrors);
  const randomWalkMae = mean(randomWalkAbsoluteErrors);
  if (dnsMae + randomWalkMae < 1e-9) return 0.5;
  return clamp(randomWalkMae / (dnsMae + randomWalkMae), MIN_MODEL_WEIGHT, MAX_MODEL_WEIGHT);
};

const runRollingBacktest = (monthlyRows: HistoricalRow[], horizonMonths: number) => {
  const observations: BacktestObservation[] = [];
  const dnsAbsoluteErrors: number[] = [];
  const randomWalkAbsoluteErrors: number[] = [];
  const priorResiduals: Record<ResearchMaturityKey, number[]> = {
    "2Y": [],
    "5Y": [],
    "10Y": [],
    "30Y": []
  };
  let covered = 0;
  let coverageObservations = 0;

  const firstOrigin = Math.max(MIN_TRAINING_MONTHS - 1, monthlyRows.length - horizonMonths - YEAR_END_BACKTEST_ORIGINS);
  for (let originIndex = firstOrigin; originIndex + horizonMonths < monthlyRows.length; originIndex += 1) {
    const origin = monthlyRows[originIndex];
    const actual = monthlyRows[originIndex + horizonMonths];
    if (monthOrdinal(actual.date) - monthOrdinal(origin.date) !== horizonMonths) continue;

    const trainingStart = Math.max(0, originIndex - YEAR_END_TRAINING_MONTHS + 1);
    const trainingRows = monthlyRows.slice(trainingStart, originIndex + 1);
    const dnsPrediction = forecastDns(trainingRows, origin, horizonMonths);
    if (!dnsPrediction) continue;

    const weight = observations.length >= MIN_INTERVAL_ORIGINS
      ? modelWeight(dnsAbsoluteErrors, randomWalkAbsoluteErrors)
      : 0.5;
    const dnsErrors = {} as Record<ResearchMaturityKey, number>;
    const randomWalkErrors = {} as Record<ResearchMaturityKey, number>;
    const ensembleResiduals = {} as Record<ResearchMaturityKey, number>;

    for (const key of maturityKeys) {
      const actualYield = Number(actual[key]);
      const randomWalkPrediction = Number(origin[key]);
      const ensemblePrediction = weight * dnsPrediction[key] + (1 - weight) * randomWalkPrediction;
      const dnsError = (actualYield - dnsPrediction[key]) * 100;
      const randomWalkError = (actualYield - randomWalkPrediction) * 100;
      const ensembleResidual = (actualYield - ensemblePrediction) * 100;
      dnsErrors[key] = dnsError;
      randomWalkErrors[key] = randomWalkError;
      ensembleResiduals[key] = ensembleResidual;

      if (priorResiduals[key].length >= MIN_INTERVAL_ORIGINS) {
        const low = ensemblePrediction + quantile(priorResiduals[key], 0.2) / 100;
        const high = ensemblePrediction + quantile(priorResiduals[key], 0.8) / 100;
        coverageObservations += 1;
        if (actualYield >= Math.min(low, high) && actualYield <= Math.max(low, high)) covered += 1;
      }
    }

    observations.push({ dnsErrorsBps: dnsErrors, randomWalkErrorsBps: randomWalkErrors, ensembleResidualsBps: ensembleResiduals });
    for (const key of maturityKeys) {
      dnsAbsoluteErrors.push(Math.abs(dnsErrors[key]));
      randomWalkAbsoluteErrors.push(Math.abs(randomWalkErrors[key]));
      priorResiduals[key].push(ensembleResiduals[key]);
    }
  }

  return {
    observations,
    dnsAbsoluteErrors,
    randomWalkAbsoluteErrors,
    ensembleResiduals: priorResiduals,
    coverageObservations,
    coveragePct: coverageObservations ? (covered / coverageObservations) * 100 : null
  };
};

export const yearEndTargetDate = (asOfDate: string) => {
  const year = Number(asOfDate.slice(0, 4));
  const target = new Date(Date.UTC(year, 11, 31));
  while (target.getUTCDay() === 0 || target.getUTCDay() === 6) target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
};

export const buildYearEndForecast = (sourceRows: HistoricalRow[]): YearEndForecast | null => {
  const completeRows = completeCurveRows(sourceRows);
  const asOf = completeRows.at(-1);
  if (!asOf) return null;
  const targetDate = yearEndTargetDate(asOf.date);
  if (targetDate <= asOf.date) return null;

  const horizonMonths = monthsToTarget(asOf.date, targetDate);
  const currentMonth = asOf.date.slice(0, 7);
  const completedMonthlyRows = contiguousMonthlyTail(
    monthEndRows(completeRows).filter((row) => row.date.slice(0, 7) < currentMonth)
  );
  if (completedMonthlyRows.length < MIN_TRAINING_MONTHS + horizonMonths) return null;

  const trainingRows = completedMonthlyRows.slice(-YEAR_END_TRAINING_MONTHS);
  const dnsPointYields = forecastDns(trainingRows, asOf, horizonMonths);
  if (!dnsPointYields) return null;

  const backtest = runRollingBacktest(completedMonthlyRows, horizonMonths);
  const dnsWeight = modelWeight(backtest.dnsAbsoluteErrors, backtest.randomWalkAbsoluteErrors);
  const randomWalkYields = Object.fromEntries(maturityKeys.map((key) => [key, Number(asOf[key])])) as Record<ResearchMaturityKey, number>;
  const yields = Object.fromEntries(maturityKeys.map((key) => {
    const rawEnsemble = dnsWeight * dnsPointYields[key] + (1 - dnsWeight) * randomWalkYields[key];
    const residuals = backtest.ensembleResiduals[key];
    const low = rawEnsemble + quantile(residuals, 0.2) / 100;
    const median = rawEnsemble + quantile(residuals, 0.5) / 100;
    const high = rawEnsemble + quantile(residuals, 0.8) / 100;
    return [key, {
      low: round(Math.min(low, median, high), 3),
      median: round(median, 3),
      high: round(Math.max(low, median, high), 3)
    }];
  })) as Record<ResearchMaturityKey, YearEndForecastRange>;

  const ensembleAbsoluteErrors = backtest.observations.flatMap((observation) =>
    maturityKeys.map((key) => Math.abs(observation.ensembleResidualsBps[key]))
  );

  return {
    asOfDate: asOf.date,
    targetDate,
    horizonMonths,
    yields,
    dnsPointYields: Object.fromEntries(maturityKeys.map((key) => [key, round(dnsPointYields[key], 3)])) as Record<ResearchMaturityKey, number>,
    randomWalkYields,
    trainingStartDate: trainingRows[0].date,
    trainingEndDate: trainingRows.at(-1)?.date ?? trainingRows[0].date,
    diagnostics: {
      backtestOrigins: backtest.observations.length,
      dnsMaeBps: backtest.dnsAbsoluteErrors.length ? round(mean(backtest.dnsAbsoluteErrors), 1) : null,
      randomWalkMaeBps: backtest.randomWalkAbsoluteErrors.length ? round(mean(backtest.randomWalkAbsoluteErrors), 1) : null,
      ensembleMaeBps: ensembleAbsoluteErrors.length ? round(mean(ensembleAbsoluteErrors), 1) : null,
      empiricalBandCoveragePct: backtest.coveragePct === null ? null : round(backtest.coveragePct, 0),
      coverageObservations: backtest.coverageObservations,
      dnsWeightPct: round(dnsWeight * 100, 0),
      randomWalkWeightPct: round((1 - dnsWeight) * 100, 0)
    }
  };
};
