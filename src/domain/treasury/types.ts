export type DashboardMaturityKey = "2Y" | "5Y" | "10Y" | "30Y";

export type ResearchMaturityKey = DashboardMaturityKey;

export type CoreCurveSpreadKey = "5Y2Y" | "10Y2Y" | "30Y2Y" | "10Y5Y" | "30Y5Y" | "30Y10Y";

export type SpreadKey = CoreCurveSpreadKey;

export type CacheStatus = "hit" | "refresh" | "stale";

export interface SummaryPoint {
  key: DashboardMaturityKey;
  label: string;
  shortLabel: string;
  field: string;
  years: number;
  value: number;
  previousValue: number;
  changeBps: number;
  changePct: number | null;
}

export interface CurvePoint {
  key: string;
  label: string;
  shortLabel: string;
  field: string;
  years: number;
  value: number;
  highlighted: boolean;
}

export interface HistoryPoint {
  date: string;
  value: number;
}

export interface SpreadPoint {
  key: string;
  label: string;
  valueBps: number;
  changeBps: number;
}

export interface TreasuryPayload {
  source: {
    name: string;
    pageUrl: string;
    feedUrl: string;
    recordDate: string;
    previousRecordDate: string;
    feedUpdatedAt: string | null;
    retrievedAt: string;
    historyWindowDays: number;
    contentSha256: string;
    transformationVersion: string;
  };
  summary: SummaryPoint[];
  curve: CurvePoint[];
  history: Record<DashboardMaturityKey, HistoryPoint[]>;
  spreads: SpreadPoint[];
  cache: {
    status: CacheStatus;
    ttlSeconds: number;
    warning?: string;
  };
}

export interface HistoricalRow {
  date: string;
  "2Y": number | null;
  "5Y": number | null;
  "10Y": number | null;
  "30Y": number | null;
  "5Y2Y": number | null;
  "10Y2Y": number | null;
  "30Y2Y": number | null;
  "10Y5Y": number | null;
  "30Y5Y": number | null;
  "30Y10Y": number | null;
}

export interface HistoricalPayload {
  source: {
    name: string;
    pageUrl: string;
    downloadUrl: string;
    primaryUse: string;
    retrievedAt: string;
    recordStartDate: string | null;
    recordEndDate: string | null;
    supplementalSource: string;
    h15ContentSha256: string;
    supplementalContentSha256: string | null;
    contentSha256: string;
    transformationVersion: string;
    note: string;
  };
  maturities: Array<{
    key: ResearchMaturityKey;
    label: string;
    shortLabel: string;
    years: number;
  }>;
  spreads: Array<{
    key: SpreadKey;
    label: string;
    longLabel: string;
    minuend: ResearchMaturityKey;
    subtrahend: ResearchMaturityKey;
  }>;
  availability: Record<
    ResearchMaturityKey,
    {
      firstDate: string | null;
      lastDate: string | null;
      observations: number;
    }
  >;
  rows: HistoricalRow[];
  cache: {
    status: CacheStatus;
    ttlSeconds: number;
    warning?: string;
  };
}

export type FuturesRange = "1D" | "5D" | "1M";
export type FuturesRateDirection = "higher" | "lower" | "unchanged" | "unavailable";
export type FuturesMarketState = "open" | "closed" | "stale";
export type FuturesSeriesMode = "requested-range" | "latest-session" | "snapshot-only";
export type FuturesSessionCoherence = "coherent" | "mixed" | "unavailable";

export interface FuturesSeriesPoint {
  timestamp: number;
  price: number;
}

export interface FuturesInstrument {
  key: DashboardMaturityKey;
  symbol: "ZT=F" | "ZF=F" | "ZN=F" | "UB=F";
  label: string;
  shortLabel: string;
  sectorNote?: string;
  minTick: number;
  yahooPageUrl: string;
  contractName: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePct: number | null;
  changeThirtySeconds: number | null;
  comparisonLabel: "Prior close" | "Prior session last" | "Unavailable";
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  quoteTime: string | null;
  tradeDate: string | null;
  sessionBars: number;
  dataQuality: "verified-session" | "snapshot-only" | "insufficient-history";
  marketState: FuturesMarketState;
  rateDirection: FuturesRateDirection;
  series: FuturesSeriesPoint[];
}

export interface FuturesPayload {
  source: {
    name: string;
    pageUrl: string;
    exchange: string;
    methodologyUrl: string;
    note: string;
    retrievedAt: string;
    delayed: true;
    displayUse: string;
    seriesMode: FuturesSeriesMode;
    seriesAsOf: string | null;
    latestTradeDate: string | null;
    sessionCoherence: FuturesSessionCoherence;
  };
  range: {
    key: FuturesRange;
    providerRange: string;
    providerInterval: string;
    intervalLabel: string;
  };
  instruments: FuturesInstrument[];
  warnings: string[];
  cache: {
    status: CacheStatus;
    ttlSeconds: number;
    warning?: string;
  };
}
