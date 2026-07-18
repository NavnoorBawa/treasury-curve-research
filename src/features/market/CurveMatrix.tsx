import { useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Database, GripVertical, RotateCcw } from "lucide-react";
import type { SpreadPoint, TreasuryPayload } from "@/domain/treasury/types";
import { formatBps, formatDate, formatTimestamp } from "@/utils/format";

interface CurveMatrixProps {
  data: TreasuryPayload;
}

const DEFAULT_SPREAD_ORDER = ["10Y2Y", "30Y5Y", "5Y2Y", "30Y2Y", "30Y10Y", "10Y5Y"];
const SPREAD_ORDER_STORAGE_KEY = "treasury-monitor:curve-matrix-order";

const readStoredOrder = (): string[] | null => {
  try {
    const raw = window.localStorage.getItem(SPREAD_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((key) => typeof key === "string") ? parsed : null;
  } catch {
    return null;
  }
};

const storeOrder = (order: string[]) => {
  try {
    window.localStorage.setItem(SPREAD_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Persistence is a convenience; ignore storage failures (private mode, quota).
  }
};

const applyOrder = (spreads: SpreadPoint[], order: string[]) => {
  const position = new Map(order.map((key, index) => [key, index]));
  return [...spreads].sort(
    (left, right) => (position.get(left.key) ?? order.length) - (position.get(right.key) ?? order.length)
  );
};

const direction = (spread: SpreadPoint) => (spread.changeBps > 0 ? "up" : spread.changeBps < 0 ? "down" : "flat");

export function CurveMatrix({ data }: CurveMatrixProps) {
  const [order, setOrder] = useState<string[]>(() => readStoredOrder() ?? DEFAULT_SPREAD_ORDER);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const orderedSpreads = applyOrder(data.spreads, order);
  const isDefaultOrder = orderedSpreads.every((spread, index) => spread.key === applyOrder(data.spreads, DEFAULT_SPREAD_ORDER)[index]?.key);

  const commitOrder = (next: string[]) => {
    setOrder(next);
    storeOrder(next);
  };

  const moveSpread = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    const current = orderedSpreads.map((spread) => spread.key);
    const sourceIndex = current.indexOf(sourceKey);
    const targetIndex = current.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, sourceKey);
    commitOrder(current);
  };

  const moveSpreadByOffset = (sourceKey: string, offset: -1 | 1) => {
    const current = orderedSpreads.map((spread) => spread.key);
    const sourceIndex = current.indexOf(sourceKey);
    const targetKey = current[sourceIndex + offset];
    if (targetKey) moveSpread(sourceKey, targetKey);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>, targetKey: string) => {
    event.preventDefault();
    if (dragKey) moveSpread(dragKey, targetKey);
    setDragKey(null);
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveSpreadByOffset(key, event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <aside className="panel panel--curve-matrix">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Curve matrix · D/D changes</p>
          <h2>Core Curve Spreads</h2>
        </div>
        {isDefaultOrder ? null : (
          <button className="text-button" type="button" onClick={() => commitOrder(DEFAULT_SPREAD_ORDER)}>
            <RotateCcw size={13} aria-hidden="true" />
            Reset order
          </button>
        )}
      </div>

      <div className="curve-matrix" aria-label="Latest official Treasury curve spreads">
        {orderedSpreads.map((spread) => {
          const move = direction(spread);
          const Icon = move === "up" ? ArrowUpRight : move === "down" ? ArrowDownRight : ArrowRight;

          return (
            <div
              className={`curve-matrix__item${dragKey === spread.key ? " curve-matrix__item--dragging" : ""}`}
              key={spread.key}
              draggable
              onDragStart={() => setDragKey(spread.key)}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, spread.key)}
            >
              <span className="curve-matrix__item-heading">
                {spread.label}
                <button
                  className="curve-matrix__handle"
                  type="button"
                  aria-label={`Reorder ${spread.label}. Use arrow up or arrow down, or drag the card.`}
                  onKeyDown={(event) => onHandleKeyDown(event, spread.key)}
                >
                  <GripVertical size={13} aria-hidden="true" />
                </button>
              </span>
              <strong>{spread.valueBps.toFixed(1)} bps</strong>
              <small className={`curve-matrix__change curve-matrix__change--${move}`}>
                <Icon size={13} aria-hidden="true" />
                D/D {formatBps(spread.changeBps)}
              </small>
            </div>
          );
        })}
      </div>
      <p className="curve-matrix__hint">Drag a spread card to rearrange. Your order is saved on this device.</p>

      <div className="curve-matrix__source">
        <span>
          <Database size={14} aria-hidden="true" />
          CMT observation {formatDate(data.source.recordDate)} · Prior {formatDate(data.source.previousRecordDate)}
        </span>
        <span>
          <Clock3 size={14} aria-hidden="true" />
          Retrieved {formatTimestamp(data.source.retrievedAt)}
        </span>
      </div>
    </aside>
  );
}
