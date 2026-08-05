import { describe, it, expect } from "vitest";
import { portionForLog, computeTotals, shiftDateKey, formatDateLabel, todayKey } from "../js/log.js";
import { makeProduct, makeNutriments } from "./helpers.js";

describe("portionForLog", () => {
  it("prefers per-serving nutrition when Open Food Facts has any serving data", () => {
    const product = makeProduct({
      servingSize: "30g",
      servingNutriments: makeNutriments({ energyKcal: 120 })
    });
    const portion = portionForLog(product);
    expect(portion.label).toBe("1 serving (30g)");
    expect(portion.nutrients.energyKcal).toBe(120);
  });

  it("labels a serving generically when OFF has no serving size string", () => {
    const product = makeProduct({ servingSize: "", servingNutriments: makeNutriments({ fat: 5 }) });
    expect(portionForLog(product).label).toBe("1 serving");
  });

  it("falls back to per-100g nutrition when there is no serving data at all", () => {
    const product = makeProduct({ nutriments: makeNutriments({ sugars: 10 }) });
    const portion = portionForLog(product);
    expect(portion.label).toBe("100g");
    expect(portion.nutrients.sugars).toBe(10);
  });
});

describe("computeTotals", () => {
  it("sums known nutrient values across entries", () => {
    const totals = computeTotals([
      { nutrients: makeNutriments({ sugars: 10, fat: 2 }) },
      { nutrients: makeNutriments({ sugars: 5, salt: 1 }) }
    ]);
    expect(totals.sugars).toBe(15);
    expect(totals.fat).toBe(2);
    expect(totals.salt).toBe(1);
  });

  it("treats missing/null values as zero contribution, not a total of zero entries", () => {
    const totals = computeTotals([{ nutrients: makeNutriments() }]);
    expect(totals.energyKcal).toBe(0);
  });

  it("returns all-zero totals for an empty log", () => {
    const totals = computeTotals([]);
    expect(totals).toMatchObject({ energyKcal: 0, fat: 0, saturatedFat: 0, sugars: 0, salt: 0, fiber: 0, proteins: 0 });
  });
});

describe("shiftDateKey / formatDateLabel", () => {
  it("shifts a date key by whole days", () => {
    expect(shiftDateKey("2026-08-05", -1)).toBe("2026-08-04");
    expect(shiftDateKey("2026-08-05", 1)).toBe("2026-08-06");
  });

  it("rolls over month boundaries", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("labels today and yesterday specially", () => {
    const today = todayKey();
    const yesterday = shiftDateKey(today, -1);
    expect(formatDateLabel(today)).toBe("Today");
    expect(formatDateLabel(yesterday)).toBe("Yesterday");
  });

  it("labels other dates as a weekday/month/day string", () => {
    const label = formatDateLabel(shiftDateKey(todayKey(), -5));
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});
