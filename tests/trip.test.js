import { describe, it, expect } from "vitest";
import { tripTally } from "../js/trip.js";

describe("tripTally", () => {
  it("counts items per tier", () => {
    const trip = {
      active: true,
      items: [
        { tier: "good" },
        { tier: "good" },
        { tier: "moderate" },
        { tier: "bad" }
      ]
    };
    expect(tripTally(trip)).toEqual({ good: 2, moderate: 1, bad: 1 });
  });

  it("returns all-zero tallies for an empty trip", () => {
    expect(tripTally({ active: true, items: [] })).toEqual({ good: 0, moderate: 0, bad: 0 });
  });

  it("does not count items with an unknown tier", () => {
    const trip = { active: true, items: [{ tier: "unknown" }, { tier: "good" }] };
    expect(tripTally(trip)).toEqual({ good: 1, moderate: 0, bad: 0 });
  });
});
