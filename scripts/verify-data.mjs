import assert from "node:assert/strict";
import { getHistoricalYieldData } from "../server/clients/historicalClient.js";
import { getTreasuryYieldData } from "../server/clients/treasuryClient.js";

const approxEqual = (actual, expected, label) => {
  assert.equal(Number(actual).toFixed(3), Number(expected).toFixed(3), label);
};

const assertSpread = (row, key, high, low) => {
  if (typeof row[high] !== "number" || typeof row[low] !== "number") {
    assert.equal(row[key], null, `${key} should be unavailable when ${high} or ${low} is unavailable`);
    return;
  }
  const expected = Math.round((row[high] - row[low]) * 1000) / 10;
  assert.equal(row[key], expected, `${key} should equal (${high} - ${low}) * 100`);
};

const assertThirtyYearGap = (row) => {
  if (row.date < "2002-02-18" || row.date > "2006-02-08") return;
  assert.equal(row["30Y"], null, `30Y should be unavailable on ${row.date}`);
  assert.equal(row["30Y2Y"], null, `30Y-2Y should be unavailable on ${row.date}`);
  assert.equal(row["30Y5Y"], null, `30Y-5Y should be unavailable on ${row.date}`);
  assert.equal(row["30Y10Y"], null, `30Y-10Y should be unavailable on ${row.date}`);
};

const treasury = await getTreasuryYieldData();
const historical = await getHistoricalYieldData();

assert.ok(treasury.source.recordDate, "Treasury record date is required");
assert.ok(treasury.source.previousRecordDate, "Treasury previous record date is required");
assert.ok(treasury.source.feedUpdatedAt, "Treasury feed timestamp is required");
assert.equal(treasury.summary.length, 4, "Dashboard requires four current maturities");
assert.equal(treasury.history["2Y"].length > 200, true, "One-year Treasury history should include business-day observations");

const summaryByKey = Object.fromEntries(treasury.summary.map((item) => [item.key, item]));
for (const key of ["2Y", "5Y", "10Y", "30Y"]) {
  assert.ok(summaryByKey[key], `${key} current summary exists`);
  assert.equal(typeof summaryByKey[key].value, "number", `${key} value is numeric`);
  const change = (summaryByKey[key].value - summaryByKey[key].previousValue) * 100;
  approxEqual(summaryByKey[key].changeBps, change, `${key} daily bps change`);
}

const latestHistoryRow = historical.rows.at(-1);
assert.ok(latestHistoryRow, "Historical rows are required");
assert.equal(historical.source.recordEndDate, latestHistoryRow.date, "Historical source end date should match latest row");
for (let index = 1; index < historical.rows.length; index += 1) {
  assert.ok(historical.rows[index - 1].date < historical.rows[index].date, "Historical rows must be strictly date ordered");
}
assert.equal(historical.availability["5Y"].firstDate, "1962-01-02", "5Y history should start in 1962");
assert.equal(historical.availability["10Y"].firstDate, "1962-01-02", "10Y history should start in 1962");
assert.equal(historical.availability["2Y"].firstDate, "1976-06-01", "2Y history should start in 1976");
assert.equal(historical.availability["30Y"].firstDate, "1977-02-15", "30Y history should start in 1977");

assertSpread(latestHistoryRow, "10Y2Y", "10Y", "2Y");
assertSpread(latestHistoryRow, "30Y2Y", "30Y", "2Y");
assertSpread(latestHistoryRow, "10Y5Y", "10Y", "5Y");
assertSpread(latestHistoryRow, "30Y5Y", "30Y", "5Y");
assertSpread(latestHistoryRow, "5Y2Y", "5Y", "2Y");
assertSpread(latestHistoryRow, "30Y10Y", "30Y", "10Y");
historical.rows.forEach((row) => {
  assertThirtyYearGap(row);
  assertSpread(row, "5Y2Y", "5Y", "2Y");
  assertSpread(row, "10Y2Y", "10Y", "2Y");
  assertSpread(row, "30Y2Y", "30Y", "2Y");
  assertSpread(row, "10Y5Y", "10Y", "5Y");
  assertSpread(row, "30Y5Y", "30Y", "5Y");
  assertSpread(row, "30Y10Y", "30Y", "10Y");
});

assert.equal(treasury.spreads.length, 6, "Dashboard requires six core curve spreads");
for (const spread of treasury.spreads) {
  assert.equal(typeof spread.valueBps, "number", `${spread.key} current spread is numeric`);
  assert.equal(typeof spread.changeBps, "number", `${spread.key} daily spread change is numeric`);
}

for (const point of treasury.summary) {
  approxEqual(latestHistoryRow[point.key], point.value, `Latest historical ${point.key} should match Treasury supplement`);
}

console.log(
  JSON.stringify(
    {
      treasuryRecordDate: treasury.source.recordDate,
      treasuryValues: treasury.summary.map(({ key, value, changeBps }) => ({ key, value, changeBps })),
      historicalStart: historical.source.recordStartDate,
      historicalEnd: historical.source.recordEndDate,
      historicalRows: historical.rows.length,
      latestSpreads: {
        "5Y2Y": latestHistoryRow["5Y2Y"],
        "10Y2Y": latestHistoryRow["10Y2Y"],
        "30Y2Y": latestHistoryRow["30Y2Y"],
        "10Y5Y": latestHistoryRow["10Y5Y"],
        "30Y5Y": latestHistoryRow["30Y5Y"],
        "30Y10Y": latestHistoryRow["30Y10Y"]
      }
    },
    null,
    2
  )
);
