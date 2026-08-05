import { describe, it, expect } from "vitest";
import {
  nutrientLevel,
  computeFallbackScore,
  getVerdict,
  explainVerdict,
  novaLabel,
  percentOfRI,
  gaugeFillFor,
  THRESHOLDS
} from "../js/health.js";
import { makeProduct, makeNutriments } from "./helpers.js";

describe("nutrientLevel", () => {
  it("returns unknown for null/undefined values", () => {
    expect(nutrientLevel("fat", null)).toBe("unknown");
    expect(nutrientLevel("fat", undefined)).toBe("unknown");
  });

  it("returns unknown for a key with no threshold defined", () => {
    // energyKcal has no FSA threshold — only fat/saturatedFat/sugars/salt do.
    expect(nutrientLevel("energyKcal", 100)).toBe("unknown");
  });

  it("treats the low boundary as inclusive", () => {
    expect(nutrientLevel("fat", THRESHOLDS.fat.low)).toBe("low");
    expect(nutrientLevel("fat", THRESHOLDS.fat.low - 0.1)).toBe("low");
  });

  it("treats the high boundary as inclusive", () => {
    expect(nutrientLevel("fat", THRESHOLDS.fat.high)).toBe("high");
    expect(nutrientLevel("fat", THRESHOLDS.fat.high + 0.1)).toBe("high");
  });

  it("returns medium strictly between the thresholds", () => {
    expect(nutrientLevel("fat", (THRESHOLDS.fat.low + THRESHOLDS.fat.high) / 2)).toBe("medium");
  });

  it("applies each nutrient's own thresholds, not fat's", () => {
    expect(nutrientLevel("salt", THRESHOLDS.salt.high)).toBe("high");
    expect(nutrientLevel("sugars", THRESHOLDS.sugars.low)).toBe("low");
  });
});

describe("computeFallbackScore", () => {
  it("returns unknown when no nutrients are known", () => {
    expect(computeFallbackScore(makeNutriments())).toBe("unknown");
  });

  it("returns bad when two or more nutrients are high", () => {
    const score = computeFallbackScore(makeNutriments({ sugars: 30, saturatedFat: 10 }));
    expect(score).toBe("bad");
  });

  it("returns moderate when exactly one nutrient is high and none are low", () => {
    const score = computeFallbackScore(makeNutriments({ sugars: 30, fat: 10 }));
    expect(score).toBe("moderate");
  });

  it("returns good when three or more nutrients are low and none are high", () => {
    const score = computeFallbackScore(makeNutriments({ fat: 1, saturatedFat: 0.5, sugars: 2, salt: 0.1 }));
    expect(score).toBe("good");
  });

  it("returns moderate for a mixed bag with no highs but fewer than three lows", () => {
    const score = computeFallbackScore(makeNutriments({ fat: 1, sugars: 10 }));
    expect(score).toBe("moderate");
  });
});

describe("getVerdict — Nutri-Score path", () => {
  it.each([
    ["a", "good"],
    ["b", "good"],
    ["c", "moderate"],
    ["d", "bad"],
    ["e", "bad"]
  ])("grade %s maps to tier %s", (grade, expectedTier) => {
    const product = makeProduct({ nutriscoreGrade: grade });
    const verdict = getVerdict(product);
    expect(verdict.tier).toBe(expectedTier);
    expect(verdict.source).toBe("nutriscore");
    expect(verdict.reason).toContain(grade.toUpperCase());
  });

  it("downgrades an otherwise-good grade for NOVA 4 ultra-processed products", () => {
    const product = makeProduct({ nutriscoreGrade: "a", novaGroup: 4 });
    const verdict = getVerdict(product);
    expect(verdict.tier).toBe("moderate");
    expect(verdict.novaDowngraded).toBe(true);
    expect(verdict.reason).toContain("downgraded");
  });

  it("does not flag a NOVA downgrade when the tier wasn't good to begin with", () => {
    const product = makeProduct({ nutriscoreGrade: "c", novaGroup: 4 });
    const verdict = getVerdict(product);
    expect(verdict.tier).toBe("moderate");
    expect(verdict.novaDowngraded).toBe(false);
  });

  it("is unaffected by NOVA when the group isn't 4", () => {
    const product = makeProduct({ nutriscoreGrade: "a", novaGroup: 1 });
    const verdict = getVerdict(product);
    expect(verdict.tier).toBe("good");
    expect(verdict.novaDowngraded).toBe(false);
  });
});

describe("getVerdict — fallback path", () => {
  it("falls back when there is no Nutri-Score grade at all", () => {
    const product = makeProduct({
      nutriscoreGrade: "",
      nutriments: makeNutriments({ sugars: 30, saturatedFat: 10 })
    });
    const verdict = getVerdict(product);
    expect(verdict.source).toBe("fallback");
    expect(verdict.tier).toBe("bad");
  });

  it("treats an empty grade string as absent rather than matching every letter (substring gotcha)", () => {
    // "abcde".includes("") is true, so getVerdict must short-circuit on the falsy
    // empty string *before* reaching that substring check — this guards that.
    const product = makeProduct({ nutriscoreGrade: "", nutriments: makeNutriments() });
    const verdict = getVerdict(product);
    expect(verdict.source).toBe("fallback");
  });

  it("reports unknown with an explanatory reason when nutrient data is incomplete", () => {
    const product = makeProduct({ nutriscoreGrade: "", nutriments: makeNutriments() });
    const verdict = getVerdict(product);
    expect(verdict.tier).toBe("unknown");
    expect(verdict.reason).toMatch(/incomplete/i);
  });

  it("still applies the NOVA 4 downgrade to a fallback-computed good score", () => {
    const product = makeProduct({
      nutriscoreGrade: "",
      novaGroup: 4,
      nutriments: makeNutriments({ fat: 1, saturatedFat: 0.5, sugars: 2, salt: 0.1 })
    });
    const verdict = getVerdict(product);
    expect(verdict.source).toBe("fallback");
    expect(verdict.tier).toBe("moderate");
    expect(verdict.novaDowngraded).toBe(true);
  });
});

describe("getVerdict — copy", () => {
  it("attaches the right emoji/label per tier", () => {
    expect(getVerdict(makeProduct({ nutriscoreGrade: "a" }))).toMatchObject({ emoji: "✅", label: "Healthy choice" });
    expect(getVerdict(makeProduct({ nutriscoreGrade: "c" }))).toMatchObject({ emoji: "⚠️", label: "Eat in moderation" });
    expect(getVerdict(makeProduct({ nutriscoreGrade: "e" }))).toMatchObject({ emoji: "🚫", label: "Not a healthy choice" });
    expect(getVerdict(makeProduct({ nutriscoreGrade: "" }))).toMatchObject({ emoji: "❔", label: "Not enough data" });
  });
});

describe("explainVerdict", () => {
  it("leads with a Nutri-Score factor when that's the source", () => {
    const product = makeProduct({ nutriscoreGrade: "b" });
    const verdict = getVerdict(product);
    const [first] = explainVerdict(product, verdict);
    expect(first.icon).toBe("📊");
    expect(first.text).toContain("Nutri-Score B");
  });

  it("leads with a fallback-estimate factor when there's no Nutri-Score", () => {
    const product = makeProduct({ nutriscoreGrade: "", nutriments: makeNutriments() });
    const verdict = getVerdict(product);
    const [first] = explainVerdict(product, verdict);
    expect(first.icon).toBe("🧮");
  });

  it("lists high and low nutrient factors with direction-appropriate icons", () => {
    const product = makeProduct({
      nutriscoreGrade: "",
      nutriments: makeNutriments({ sugars: 30, fat: 1 })
    });
    const verdict = getVerdict(product);
    const factors = explainVerdict(product, verdict);
    const sugarFactor = factors.find(f => f.text.includes("Sugars"));
    const fatFactor = factors.find(f => f.text.includes("Fat") && !f.text.includes("Saturated"));
    expect(sugarFactor.icon).toBe("🔺");
    expect(fatFactor.icon).toBe("🔻");
  });

  it("omits nutrients that are merely medium", () => {
    const product = makeProduct({
      nutriscoreGrade: "",
      nutriments: makeNutriments({ sugars: (THRESHOLDS.sugars.low + THRESHOLDS.sugars.high) / 2 })
    });
    const verdict = getVerdict(product);
    const factors = explainVerdict(product, verdict);
    expect(factors.some(f => f.text.includes("Sugars"))).toBe(false);
  });

  it("explains a NOVA downgrade differently from plain ultra-processed flagging", () => {
    const downgraded = makeProduct({ nutriscoreGrade: "a", novaGroup: 4 });
    const downgradedVerdict = getVerdict(downgraded);
    const downgradedFactor = explainVerdict(downgraded, downgradedVerdict).find(f => f.icon === "⚙️");
    expect(downgradedFactor.text).toContain("downgraded");

    const plain = makeProduct({ nutriscoreGrade: "c", novaGroup: 4 });
    const plainVerdict = getVerdict(plain);
    const plainFactor = explainVerdict(plain, plainVerdict).find(f => f.icon === "⚙️");
    expect(plainFactor.text).not.toContain("downgraded");
  });

  it("adds no processing factor when NOVA group is absent", () => {
    const product = makeProduct({ nutriscoreGrade: "a", novaGroup: null });
    const verdict = getVerdict(product);
    expect(explainVerdict(product, verdict).some(f => f.icon === "⚙️")).toBe(false);
  });
});

describe("novaLabel", () => {
  it.each([
    [1, "1 · Unprocessed"],
    [2, "2 · Processed culinary"],
    [3, "3 · Processed"],
    [4, "4 · Ultra-processed"]
  ])("group %s", (group, expectedText) => {
    expect(novaLabel(group).text).toBe(expectedText);
  });

  it("falls back to a placeholder for missing/unrecognized groups", () => {
    expect(novaLabel(null).text).toBe("—");
    expect(novaLabel(undefined).text).toBe("—");
    expect(novaLabel(5).text).toBe("—");
  });
});

describe("percentOfRI", () => {
  it("returns null for a missing value", () => {
    expect(percentOfRI("sugars", null)).toBeNull();
    expect(percentOfRI("sugars", undefined)).toBeNull();
  });

  it("returns null for a key with no reference intake", () => {
    // "barcode" isn't a nutrient — no entry in REFERENCE_INTAKE.
    expect(percentOfRI("barcode", 10)).toBeNull();
  });

  it("computes and rounds the percentage of daily reference intake", () => {
    expect(percentOfRI("sugars", 45)).toBe(50); // 45 / 90g RI
  });

  it("caps at 100 even when the value exceeds the reference intake", () => {
    expect(percentOfRI("sugars", 900)).toBe(100);
  });
});

describe("gaugeFillFor", () => {
  it.each([
    ["a", 0.95],
    ["b", 0.75],
    ["c", 0.55],
    ["d", 0.35],
    ["e", 0.15]
  ])("uses the grade-based fill for grade %s when a Nutri-Score is present", (grade, expected) => {
    const product = makeProduct({ nutriscoreGrade: grade });
    const verdict = getVerdict(product);
    expect(gaugeFillFor(product, verdict)).toBe(expected);
  });

  it("falls back to a tier-based fill when there's no Nutri-Score", () => {
    const product = makeProduct({ nutriscoreGrade: "", nutriments: makeNutriments({ fat: 1, saturatedFat: 0.5, sugars: 2, salt: 0.1 }) });
    const verdict = getVerdict(product);
    expect(gaugeFillFor(product, verdict)).toBe(0.75); // tier "good"
  });

  it("uses a near-empty fill for an unknown tier", () => {
    const product = makeProduct({ nutriscoreGrade: "", nutriments: makeNutriments() });
    const verdict = getVerdict(product);
    expect(gaugeFillFor(product, verdict)).toBe(0.05);
  });
});
