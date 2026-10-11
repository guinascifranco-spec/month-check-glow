/** A date-only financial period with an inclusive start and exclusive end. */
export type FinancialCycle = {
  startInclusive: string;
  endExclusive: string;
};

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Returns the financial cycle containing an ISO date-only value (YYYY-MM-DD).
 * Dates are treated as civil calendar dates; no Date parsing or timezone
 * conversion is involved. Cycles run from the 2nd through the following 1st.
 */
export function getFinancialCycle(date: string): FinancialCycle {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (date.length !== 10 || !match) {
    throw new RangeError("Expected a valid date in YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("Expected a valid date in YYYY-MM-DD format");
  }

  let startYear = year;
  let startMonth = month;
  if (day === 1) {
    startMonth -= 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear -= 1;
    }
  }

  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth === 13) {
    endMonth = 1;
    endYear += 1;
  }

  return {
    startInclusive: formatDate(startYear, startMonth, 2),
    endExclusive: formatDate(endYear, endMonth, 2),
  };
}

/** Formats the inclusive civil-date range represented by a cycle. */
export function formatFinancialCycleRange(cycle: FinancialCycle): string {
  const inclusiveEnd = `${cycle.endExclusive.slice(0, 7)}-01`;
  const format = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return `${format(cycle.startInclusive)} – ${format(inclusiveEnd)}`;
}
