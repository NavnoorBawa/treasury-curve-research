export const formatYield = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(2)}%`;
};

export const formatBps = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} bps`;
};

export const formatPct = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export const formatDate = (isoDate?: string | null) => {
  if (!isoDate) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${isoDate}T00:00:00Z`));
};

export const formatShortDate = (isoDate?: string | null) => {
  if (!isoDate) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${isoDate}T00:00:00Z`));
};

export const formatTimestamp = (isoTimestamp?: string | null) => {
  if (!isoTimestamp) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short"
  }).format(new Date(isoTimestamp));
};

export const formatRange = (values: number[]) => {
  if (!values.length) return "n/a";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${formatYield(min)} - ${formatYield(max)}`;
};
