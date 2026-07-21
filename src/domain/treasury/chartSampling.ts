export const sampleTimeSeriesByExtrema = <T extends object>(
  rows: readonly T[],
  numericKeys: readonly (keyof T)[],
  maxPoints = 700
): T[] => {
  if (!Number.isInteger(maxPoints) || maxPoints < 2) {
    throw new Error("Chart sampling requires at least two output points.");
  }

  if (rows.length <= maxPoints) return rows.slice();

  const lastIndex = rows.length - 1;
  const interiorLength = Math.max(0, rows.length - 2);
  const selectionSlotsPerBucket = Math.max(2, numericKeys.length * 3);

  if (maxPoints < selectionSlotsPerBucket + 2) {
    return Array.from({ length: maxPoints }, (_, index) => {
      const sourceIndex = Math.round((index * lastIndex) / (maxPoints - 1));
      return rows[sourceIndex];
    });
  }

  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / selectionSlotsPerBucket));
  const bucketSize = Math.max(1, Math.ceil(interiorLength / bucketCount));
  const selectedIndices = new Set<number>([0, lastIndex]);

  for (let start = 1; start < lastIndex; start += bucketSize) {
    const end = Math.min(lastIndex, start + bucketSize);

    for (const key of numericKeys) {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      let minimumIndex = -1;
      let maximumIndex = -1;
      let missingIndex = -1;

      for (let index = start; index < end; index += 1) {
        const value = rows[index][key];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          if (missingIndex < 0) missingIndex = index;
          continue;
        }

        if (value < minimum) {
          minimum = value;
          minimumIndex = index;
        }
        if (value > maximum) {
          maximum = value;
          maximumIndex = index;
        }
      }

      if (minimumIndex >= 0) selectedIndices.add(minimumIndex);
      if (maximumIndex >= 0) selectedIndices.add(maximumIndex);
      if (missingIndex >= 0) selectedIndices.add(missingIndex);
    }
  }

  return [...selectedIndices]
    .sort((left, right) => left - right)
    .map((index) => rows[index]);
};
