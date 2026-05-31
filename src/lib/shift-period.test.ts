import { describe, it, expect } from "vitest";
import { monthsInPeriod } from "./shift-period";

describe("monthsInPeriod", () => {
  it("returns a single month when start and end are within the same month", () => {
    expect(monthsInPeriod("2026-04-01", "2026-04-30")).toEqual([
      "2026-04-01",
    ]);
  });

  it("expands a 3-month spring term to three month-firsts", () => {
    expect(monthsInPeriod("2026-04-01", "2026-06-30")).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("includes the start month even when the period starts mid-month", () => {
    expect(monthsInPeriod("2026-04-16", "2026-06-30")).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("includes the end month even when the period ends mid-month", () => {
    expect(monthsInPeriod("2026-04-01", "2026-06-15")).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("crosses the year boundary correctly", () => {
    expect(monthsInPeriod("2026-12-15", "2027-02-10")).toEqual([
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ]);
  });

  it("returns an empty list when end < start", () => {
    expect(monthsInPeriod("2026-06-01", "2026-04-30")).toEqual([]);
  });

  it("returns an empty list for malformed input", () => {
    expect(monthsInPeriod("invalid", "2026-04-01")).toEqual([]);
    expect(monthsInPeriod("2026-04-01", "")).toEqual([]);
  });

  it("handles same-day start and end", () => {
    expect(monthsInPeriod("2026-04-15", "2026-04-15")).toEqual(["2026-04-01"]);
  });
});
