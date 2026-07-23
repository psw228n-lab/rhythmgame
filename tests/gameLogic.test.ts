import { describe, expect, it } from "vitest";
import { applyJudgement, calculateAccuracy, calculateRank, createScoreState, judgeTiming } from "../src/game/JudgeManager";
import { postProcessNotes, validateChart } from "../src/game/chartUtils";
import type { ChartNote } from "../src/game/types";
// 이 모듈은 Node 기반 자동 채보 생성기와 동일한 후처리 함수를 사용합니다.
import { sanitizeGeneratedNotes } from "../scripts/chartAnalysis.mjs";

describe("판정 시간 계산", () => {
  it("경계값을 설정대로 판정한다", () => {
    expect(judgeTiming(45)).toBe("Perfect");
    expect(judgeTiming(-90)).toBe("Great");
    expect(judgeTiming(140)).toBe("Good");
    expect(judgeTiming(141)).toBe("Miss");
  });
});

describe("점수, 콤보, 정확도", () => {
  it("Miss에서 콤보를 초기화한다", () => {
    let state = createScoreState();
    state = applyJudgement(state, "Perfect");
    state = applyJudgement(state, "Great");
    expect(state.score).toBe(1700);
    expect(state.combo).toBe(2);
    state = applyJudgement(state, "Miss");
    expect(state.combo).toBe(0);
    expect(state.maxCombo).toBe(2);
  });

  it("가중 정확도와 랭크를 계산한다", () => {
    let state = createScoreState();
    state = applyJudgement(state, "Perfect");
    state = applyJudgement(state, "Great");
    expect(calculateAccuracy(state)).toBeCloseTo(85);
    expect(calculateRank(95)).toBe("S");
    expect(calculateRank(89.99)).toBe("B");
  });
});

describe("채보 검증과 후처리", () => {
  it("올바른 JSON 구조만 통과시킨다", () => {
    expect(validateChart({
      title: "Test",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 1, type: "tap" }],
    })).toBe(true);
    expect(validateChart({ title: "Bad", notes: [{ time: -1, lane: 8 }] })).toBe(false);
  });

  it("노트를 정렬하고 잘못된 값과 과밀 입력을 제거한다", () => {
    const source: ChartNote[] = [
      { time: 3, lane: 1, type: "tap" },
      { time: -1, lane: 0, type: "tap" },
      { time: 2, lane: 0, type: "tap" },
      { time: 2.01, lane: 0, type: "tap" },
      { time: 2, lane: 1, type: "tap" },
      { time: 2, lane: 2, type: "tap" },
      { time: 2, lane: 3, type: "tap" },
    ];
    const result = postProcessNotes(source, "normal", 10);
    expect(result.every((note, index) => index === 0 || note.time >= result[index - 1].time)).toBe(true);
    expect(result.filter((note) => note.time === 2)).toHaveLength(2);
    expect(result.every((note) => note.time >= 0 && note.lane <= 3)).toBe(true);
  });

  it("자동 생성 채보가 비어 있지 않고 재생 범위를 벗어나지 않는다", () => {
    const notes = sanitizeGeneratedNotes([
      { time: 2, lane: 0, type: "tap" },
      { time: 2.5, lane: 1, type: "hold", duration: 0.8 },
      { time: 15, lane: 2, type: "tap" },
    ], "easy", 10);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note: ChartNote) => note.time < 10)).toBe(true);
  });
});
