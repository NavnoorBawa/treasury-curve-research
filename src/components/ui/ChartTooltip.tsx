import { formatShortDate, formatYield } from "@/utils/format";

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    value?: number;
    payload?: {
      date?: string;
      label?: string;
      shortLabel?: string;
      value?: number;
    };
  }>;
}

export function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  const point = item.payload ?? {};
  const title = point.date ? formatShortDate(point.date) : point.label ?? point.shortLabel ?? label;
  const value = typeof item.value === "number" ? item.value : point.value;

  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip__label">{title}</span>
      <strong>{formatYield(value)}</strong>
    </div>
  );
}
