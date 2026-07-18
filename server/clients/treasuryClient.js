import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import {
  CURVE_MATURITIES,
  DASHBOARD_MATURITIES,
  DATA_SOURCE,
  HISTORY_WINDOW_DAYS,
  RESEARCH_SPREADS,
  TREASURY_DATASET,
  TREASURY_FEED_URL
} from "../config.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const unwrap = (value) => {
  if (value && typeof value === "object" && "#text" in value) {
    return value["#text"];
  }
  return value;
};

const toNumber = (value) => {
  const raw = unwrap(value);
  if (raw === null || raw === undefined || raw === "" || raw === "N/A") {
    return null;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const toIsoDate = (value) => {
  const raw = unwrap(value);
  return typeof raw === "string" ? raw.slice(0, 10) : null;
};

const getNewYorkYear = () => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric"
  });
  return Number(formatter.format(new Date()));
};

const fetchWithTimeout = async (url, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "TreasuryCurveResearch/1.0 (+https://treasury-curve-research.vercel.app/)"
      }
    });

    if (!response.ok) {
      throw new Error(`Treasury feed returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const buildYearUrl = (year) => {
  const params = new URLSearchParams({
    data: TREASURY_DATASET,
    field_tdr_date_value: String(year)
  });
  return `${TREASURY_FEED_URL}?${params.toString()}`;
};

const parseYearFeed = (xml, year) => {
  const parsed = parser.parse(xml);
  const feed = parsed.feed ?? {};
  const entries = asArray(feed.entry);

  const rows = entries
    .map((entry) => {
      const properties = entry?.content?.properties;
      const date = toIsoDate(properties?.NEW_DATE);
      if (!date) return null;

      const values = Object.fromEntries(
        CURVE_MATURITIES.map((maturity) => [maturity.key, toNumber(properties?.[maturity.field])])
      );

      return { date, values };
    })
    .filter(Boolean);

  return {
    year,
    feedUpdatedAt: typeof feed.updated === "string" ? feed.updated : null,
    rows
  };
};

const uniqueSortedRows = (feeds) => {
  const byDate = new Map();

  feeds
    .flatMap((feed) => feed.rows)
    .forEach((row) => {
      byDate.set(row.date, row);
    });

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const hasDashboardValues = (row) =>
  DASHBOARD_MATURITIES.every((maturity) => typeof row.values[maturity.key] === "number");

const findLatestPair = (rows) => {
  const usable = rows.filter(hasDashboardValues);
  if (usable.length < 2) {
    throw new Error("Treasury feed does not include enough recent observations.");
  }

  return {
    previous: usable.at(-2),
    latest: usable.at(-1)
  };
};

const round = (value, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const buildSummary = (latest, previous) =>
  DASHBOARD_MATURITIES.map((maturity) => {
    const value = latest.values[maturity.key];
    const previousValue = previous.values[maturity.key];
    const change = value - previousValue;

    return {
      ...maturity,
      value: round(value, 3),
      previousValue: round(previousValue, 3),
      changeBps: round(change * 100, 1),
      changePct: previousValue ? round((change / previousValue) * 100, 2) : null
    };
  });

const buildCurve = (latest) =>
  CURVE_MATURITIES.map((maturity) => ({
    ...maturity,
    value: round(latest.values[maturity.key], 3),
    highlighted: DASHBOARD_MATURITIES.some((item) => item.key === maturity.key)
  })).filter((point) => typeof point.value === "number");

const buildHistory = (rows, latest) => {
  const cutoff = new Date(`${latest.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_WINDOW_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return Object.fromEntries(
    DASHBOARD_MATURITIES.map((maturity) => [
      maturity.key,
      rows
        .filter((row) => row.date >= cutoffDate && typeof row.values[maturity.key] === "number")
        .map((row) => ({
          date: row.date,
          value: round(row.values[maturity.key], 3)
        }))
    ])
  );
};

const buildSpreads = (latest, previous) =>
  RESEARCH_SPREADS.map(({ key, label, minuend, subtrahend }) => {
    const current = latest.values[minuend] - latest.values[subtrahend];
    const prior = previous.values[minuend] - previous.values[subtrahend];

    return {
      key,
      label,
      valueBps: round(current * 100, 1),
      changeBps: round((current - prior) * 100, 1)
    };
  });

export async function getTreasuryYieldData() {
  const currentYear = getNewYorkYear();
  const years = [currentYear - 1, currentYear];

  const feeds = await Promise.all(
    years.map(async (year) => {
      const xml = await fetchWithTimeout(buildYearUrl(year));
      return { ...parseYearFeed(xml, year), contentHash: sha256(xml) };
    })
  );

  const rows = uniqueSortedRows(feeds);
  const { latest, previous } = findLatestPair(rows);
  const feedUpdatedAt = feeds
    .map((feed) => feed.feedUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    source: {
      ...DATA_SOURCE,
      recordDate: latest.date,
      previousRecordDate: previous.date,
      feedUpdatedAt,
      retrievedAt: new Date().toISOString(),
      historyWindowDays: HISTORY_WINDOW_DAYS,
      contentSha256: sha256(feeds.map((feed) => `${feed.year}:${feed.contentHash}`).join("|")),
      transformationVersion: "treasury-cmt-v2"
    },
    summary: buildSummary(latest, previous),
    curve: buildCurve(latest),
    history: buildHistory(rows, latest),
    spreads: buildSpreads(latest, previous)
  };
}
