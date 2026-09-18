export type WeekdayDefinition = {
  index: number;
  key: string;
  label: string;
  shortLabel: string;
};

export type WeekdayPatternRow = WeekdayDefinition & {
  occurrences: number;
  observedDays: number;
  recordCount: number;
  total: number;
  average: number;
  share: number;
};

export type WeekdayPatternSummary = {
  from: string;
  to: string;
  rangeDays: number;
  total: number;
  observedDays: number;
  recordCount: number;
  rows: WeekdayPatternRow[];
  best: WeekdayPatternRow | null;
  weakest: WeekdayPatternRow | null;
};

export type WeekdayPatternOptions<T> = {
  from: string;
  to: string;
  getDate: (record: T) => string;
  getValue: (record: T) => number;
  occurrenceMode?: "calendar" | "observed";
};

export const WEEKDAY_DEFINITIONS: WeekdayDefinition[] = [
  { index: 1, key: "monday", label: "Monday", shortLabel: "Mon" },
  { index: 2, key: "tuesday", label: "Tuesday", shortLabel: "Tue" },
  { index: 3, key: "wednesday", label: "Wednesday", shortLabel: "Wed" },
  { index: 4, key: "thursday", label: "Thursday", shortLabel: "Thu" },
  { index: 5, key: "friday", label: "Friday", shortLabel: "Fri" },
  { index: 6, key: "saturday", label: "Saturday", shortLabel: "Sat" },
  { index: 0, key: "sunday", label: "Sunday", shortLabel: "Sun" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateToUTCMillis(dateISO: string): number | null {
  const match = ISO_DATE_PATTERN.exec(dateISO);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

export function weekdayIndex(dateISO: string): number | null {
  const timestamp = dateToUTCMillis(dateISO);
  return timestamp === null ? null : new Date(timestamp).getUTCDay();
}

export function countCalendarDays(from: string, to: string): number {
  const start = dateToUTCMillis(from);
  const end = dateToUTCMillis(to);
  if (start === null || end === null || start > end) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

export function analyzeWeekdayPattern<T>(
  records: readonly T[],
  options: WeekdayPatternOptions<T>
): WeekdayPatternSummary {
  const fromTimestamp = dateToUTCMillis(options.from);
  const toTimestamp = dateToUTCMillis(options.to);
  const occurrenceMode = options.occurrenceMode ?? "calendar";
  const rowsByIndex = new Map<number, WeekdayPatternRow>();
  const observedDatesByIndex = new Map<number, Set<string>>();

  for (const definition of WEEKDAY_DEFINITIONS) {
    rowsByIndex.set(definition.index, {
      ...definition,
      occurrences: 0,
      observedDays: 0,
      recordCount: 0,
      total: 0,
      average: 0,
      share: 0,
    });
    observedDatesByIndex.set(definition.index, new Set<string>());
  }

  if (fromTimestamp === null || toTimestamp === null || fromTimestamp > toTimestamp) {
    return {
      from: options.from,
      to: options.to,
      rangeDays: 0,
      total: 0,
      observedDays: 0,
      recordCount: 0,
      rows: WEEKDAY_DEFINITIONS.map(({ index }) => rowsByIndex.get(index)!),
      best: null,
      weakest: null,
    };
  }

  const rangeDays = Math.floor((toTimestamp - fromTimestamp) / DAY_MS) + 1;

  if (occurrenceMode === "calendar") {
    for (let timestamp = fromTimestamp; timestamp <= toTimestamp; timestamp += DAY_MS) {
      const index = new Date(timestamp).getUTCDay();
      const row = rowsByIndex.get(index)!;
      row.occurrences += 1;
    }
  }

  let total = 0;
  let recordCount = 0;
  const observedDates = new Set<string>();

  for (const record of records) {
    const date = options.getDate(record);
    const timestamp = dateToUTCMillis(date);
    if (timestamp === null || timestamp < fromTimestamp || timestamp > toTimestamp) continue;

    const index = new Date(timestamp).getUTCDay();
    const row = rowsByIndex.get(index)!;
    const value = options.getValue(record);
    const numericValue = Number.isFinite(value) ? value : 0;
    row.total += numericValue;
    row.recordCount += 1;
    total += numericValue;
    recordCount += 1;
    observedDates.add(date);
    observedDatesByIndex.get(index)!.add(date);
  }

  for (const definition of WEEKDAY_DEFINITIONS) {
    const row = rowsByIndex.get(definition.index)!;
    row.observedDays = observedDatesByIndex.get(definition.index)!.size;
    if (occurrenceMode === "observed") row.occurrences = row.observedDays;
    row.average = row.occurrences > 0 ? row.total / row.occurrences : 0;
    row.share = total !== 0 ? row.total / total : 0;
  }

  const rows = WEEKDAY_DEFINITIONS.map(({ index }) => rowsByIndex.get(index)!);
  const observedRows = rows.filter((row) => row.recordCount > 0);
  const rankedRows = [...observedRows].sort(
    (a, b) => b.average - a.average || b.total - a.total || a.index - b.index
  );

  return {
    from: options.from,
    to: options.to,
    rangeDays,
    total,
    observedDays: observedDates.size,
    recordCount,
    rows,
    best: rankedRows[0] ?? null,
    weakest: rankedRows[rankedRows.length - 1] ?? null,
  };
}
