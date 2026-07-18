import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import type { CurvePoint } from "@/domain/treasury/types";
import { formatDate } from "@/utils/format";

interface YieldCurveChartProps {
  data: CurvePoint[];
  recordDate: string;
}

interface CurveDotProps {
  cx?: number;
  cy?: number;
  payload?: CurvePoint;
}

function CurveDot({ cx, cy, payload }: CurveDotProps) {
  if (!payload?.highlighted || typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--chart-highlight)"
      stroke="var(--surface)"
      strokeWidth={2}
    />
  );
}

export function YieldCurveChart({ data, recordDate }: YieldCurveChartProps) {
  return (
    <div className="panel panel--curve">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Curve</p>
          <h2>U.S. Treasury Yield Curve</h2>
        </div>
        <span className="panel__meta">As of {formatDate(recordDate)} · Official CMT par yields</span>
      </div>
      <div className="curve-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 14, right: 10, bottom: 2, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
            <XAxis
              dataKey="shortLabel"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              domain={["dataMin - 0.18", "dataMax + 0.18"]}
              tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--chart-crosshair)" }} />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--chart-curve)"
              strokeWidth={2.6}
              dot={<CurveDot />}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)", fill: "var(--chart-curve)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
