import { describe, expect, it } from "vitest";
import { estimateBeatPhase, refineBpmToBeatGrid } from "../scripts/chartAnalysis.mjs";

function createPulseTrain(bpm, seconds, phase = 0.03) {
  const sixteenth = 60 / bpm / 4;
  const accents = [3, 1, 1.6, 1];
  const onsets = [];
  for (let time = phase, slot = 0; time < seconds; time += sixteenth, slot += 1) {
    onsets.push({ time, strength: accents[slot % accents.length], energy: 1 });
  }
  return onsets;
}

describe("beat-grid BPM refinement", () => {
  it("corrects a nearby coarse BPM to the stable song tempo", () => {
    const onsets = createPulseTrain(125, 90);
    expect(refineBpmToBeatGrid(onsets, 123.5)).toBe(125);
  });

  it("finds the phase of the strongest quarter-note pulse", () => {
    const onsets = createPulseTrain(125, 30);
    expect(estimateBeatPhase(onsets, 125)).toBeCloseTo(0.03, 2);
  });
});
