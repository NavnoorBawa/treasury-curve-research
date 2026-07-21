import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import {
  FED_H15_TREASURY_CMT_URL,
  HISTORICAL_30Y_UNAVAILABLE_END,
  HISTORICAL_30Y_UNAVAILABLE_START,
  HISTORICAL_MATURITIES,
  HISTORICAL_SOURCE,
  RESEARCH_SPREADS
} from "../config.js";
import { getTreasuryYieldData } from "./treasuryClient.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const fetchWithTimeout = async (url, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/csv,*/*;q=0.8",
        "User-Agent": "TreasuryCurveResearch/1.0 (+https://treasury-curve-research.vercel.app/)"
      }
    });

    if (!response.ok) {
      throw new Error(`Federal Reserve H.15 download returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const toNumber = (value) => {
  const normalized = typeof value === "string" ? value.trim() : value;

  if (normalized === null || normalized === undefined || normalized === "" || normalized === "ND" || normalized === "n.a.") {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 3) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isThirtyYearUnavailable = (date) =>
  date >= HISTORICAL_30Y_UNAVAILABLE_START && date <= HISTORICAL_30Y_UNAVAILABLE_END;

const buildSpreadValues = (row) => {
  for (const spread of RESEARCH_SPREADS) {
    const high = row[spread.minuend];
    const low = row[spread.subtrahend];
    row[spread.key] = typeof high === "number" && typeof low === "number" ? round((high - low) * 100, 1) : null;
  }

  return row;
};

const parseFedCsv = (csv) => {
  const records = parse(csv, {
    relax_column_count: true,
    skip_empty_lines: true
  });

  const headerIndex = records.findIndex((row) => row[0] === "Time Period");
  if (headerIndex === -1) {
    throw new Error("Federal Reserve H.15 CSV did not include a Time Period header.");
  }

  const headers = records[headerIndex];
  const fieldIndex = new Map(headers.map((field, index) => [field, index]));
  const missingFields = HISTORICAL_MATURITIES.filter((maturity) => !fieldIndex.has(maturity.field));

  if (missingFields.length) {
    throw new Error(`Federal Reserve H.15 CSV is missing required series: ${missingFields.map((maturity) => maturity.key).join(", ")}`);
  }

  const rows = records
    .slice(headerIndex + 1)
    .filter((record) => isIsoDate(record[0]))
    .map((record) => {
      const row = { date: record[0] };

      for (const maturity of HISTORICAL_MATURITIES) {
        const index = fieldIndex.get(maturity.field);
        row[maturity.key] = typeof index === "number" ? toNumber(record[index]) : null;
      }

      if (isThirtyYearUnavailable(row.date)) {
        row["30Y"] = null;
      }

      return buildSpreadValues(row);
    })
    .filter((row) => HISTORICAL_MATURITIES.some((maturity) => typeof row[maturity.key] === "number"));

  return rows.sort((left, right) => left.date.localeCompare(right.date));
};

const treasuryLatestToResearchRow = (treasuryData) => {
  const row = { date: treasuryData.source.recordDate };

  for (const point of treasuryData.curve) {
    if (HISTORICAL_MATURITIES.some((maturity) => maturity.key === point.key)) {
      row[point.key] = point.value;
    }
  }

  return buildSpreadValues(row);
};

const mergeTreasuryLatest = (rows, treasuryResult) => {
  if (treasuryResult.status === "rejected") {
    const error = treasuryResult.reason;
    return {
      rows,
      supplementalSource:
        error instanceof Error
          ? `Treasury latest supplement unavailable: ${error.message}`
          : "Treasury latest supplement unavailable.",
      supplementalContentSha256: null
    };
  }

  const treasuryData = treasuryResult.value;
  const latestTreasuryRow = treasuryLatestToResearchRow(treasuryData);
  const existingIndex = rows.findIndex((row) => row.date === latestTreasuryRow.date);

  if (existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...latestTreasuryRow };
    return { rows, supplementalSource: "Treasury XML replaced matching latest date.", supplementalContentSha256: treasuryData.source.contentSha256 };
  }

  const latestFedDate = rows.at(-1)?.date;
  if (latestFedDate && latestTreasuryRow.date > latestFedDate) {
    return {
      rows: [...rows, latestTreasuryRow].sort((a, b) => a.date.localeCompare(b.date)),
      supplementalSource: "Treasury XML appended fresher latest official observation.",
      supplementalContentSha256: treasuryData.source.contentSha256
    };
  }

  return { rows, supplementalSource: "Federal Reserve H.15 contains the latest research observation.", supplementalContentSha256: treasuryData.source.contentSha256 };
};

const buildAvailability = (rows) =>
  Object.fromEntries(
    HISTORICAL_MATURITIES.map((maturity) => {
      const valid = rows.filter((row) => typeof row[maturity.key] === "number");
      return [
        maturity.key,
        {
          firstDate: valid[0]?.date ?? null,
          lastDate: valid.at(-1)?.date ?? null,
          observations: valid.length
        }
      ];
    })
  );

export async function getHistoricalYieldData() {
  const [h15Result, treasuryResult] = await Promise.allSettled([
    fetchWithTimeout(FED_H15_TREASURY_CMT_URL),
    getTreasuryYieldData()
  ]);
  if (h15Result.status === "rejected") throw h15Result.reason;

  const csv = h15Result.value;
  const h15ContentSha256 = sha256(csv);
  const parsedRows = parseFedCsv(csv);
  const { rows, supplementalSource, supplementalContentSha256 } = mergeTreasuryLatest(parsedRows, treasuryResult);

  return {
    source: {
      ...HISTORICAL_SOURCE,
      retrievedAt: new Date().toISOString(),
      recordStartDate: rows[0]?.date ?? null,
      recordEndDate: rows.at(-1)?.date ?? null,
      supplementalSource,
      h15ContentSha256,
      supplementalContentSha256,
      contentSha256: sha256(`${h15ContentSha256}|${supplementalContentSha256 ?? "none"}`),
      transformationVersion: "h15-cmt-history-v2",
      note:
        "The observed 30Y CMT is intentionally unavailable from February 18, 2002 through February 8, 2006, the Treasury discontinuation/reintroduction interval; dependent 30Y spreads are null for the same period."
    },
    maturities: HISTORICAL_MATURITIES.map(({ key, label, shortLabel, years }) => ({
      key,
      label,
      shortLabel,
      years
    })),
    spreads: RESEARCH_SPREADS,
    availability: buildAvailability(rows),
    rows
  };
}
