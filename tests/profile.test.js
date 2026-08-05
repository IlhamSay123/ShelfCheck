import { describe, it, expect } from "vitest";
import { checkConflicts, hasProfileSet } from "../js/profile.js";
import { makeProduct } from "./helpers.js";

describe("checkConflicts", () => {
  it("flags a matched allergen by its friendly label", () => {
    const product = makeProduct({ allergenTags: ["peanuts"] });
    const profile = { allergens: ["peanuts"], diets: [], limits: {} };
    const warnings = checkConflicts(product, profile);
    expect(warnings.some(w => w.includes("Peanuts"))).toBe(true);
  });

  it("flags a non-vegan product for a vegan profile", () => {
    const product = makeProduct({ ingredientsAnalysisTags: ["non-vegan"] });
    const profile = { allergens: [], diets: ["vegan"], limits: {} };
    expect(checkConflicts(product, profile)).toContain("Not vegan");
  });

  it("flags unclear vegan status separately from a confirmed non-vegan product", () => {
    const product = makeProduct({ ingredientsAnalysisTags: ["maybe-vegan"] });
    const profile = { allergens: [], diets: ["vegan"], limits: {} };
    expect(checkConflicts(product, profile)).toContain("May not be vegan — ingredients unclear");
  });

  it("flags a product missing a halal label for a halal profile", () => {
    const product = makeProduct({ labelTags: [] });
    const profile = { allergens: [], diets: ["halal"], limits: {} };
    expect(checkConflicts(product, profile)).toContain("Not labeled halal");
  });

  it("flags a nutrient exceeding a configured limit", () => {
    const product = makeProduct({ nutriments: { sugars: 40 } });
    const profile = { allergens: [], diets: [], limits: { sugars: 10 } };
    const warnings = checkConflicts(product, profile);
    expect(warnings.some(w => w.includes("exceeds your limit"))).toBe(true);
  });

  it("returns no warnings for a clean product against an empty profile", () => {
    const product = makeProduct();
    const profile = { allergens: [], diets: [], limits: {} };
    expect(checkConflicts(product, profile)).toEqual([]);
  });
});

describe("hasProfileSet", () => {
  it("is false for a fresh profile", () => {
    expect(hasProfileSet({ allergens: [], diets: [], limits: {} })).toBe(false);
  });

  it("is true once an allergen, diet, or limit is set", () => {
    expect(hasProfileSet({ allergens: ["milk"], diets: [], limits: {} })).toBe(true);
    expect(hasProfileSet({ allergens: [], diets: ["vegan"], limits: {} })).toBe(true);
    expect(hasProfileSet({ allergens: [], diets: [], limits: { salt: 2 } })).toBe(true);
  });
});
