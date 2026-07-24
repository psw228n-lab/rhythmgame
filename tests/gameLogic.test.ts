import { describe, expect, it } from "vitest";
import { applyJudgement, calculateAccuracy, calculateRank, createScoreState, judgeTiming } from "../src/game/JudgeManager";
import { postProcessNotes, removePostHoldLaneConflicts, validateChart } from "../src/game/chartUtils";
import type { ChartNote } from "../src/game/types";
// 이 모듈은 Node 기반 자동 채보 생성기와 동일한 후처리 함수를 사용합니다.
import { sanitizeGeneratedNotes } from "../scripts/chartAnalysis.mjs";
import { GameEngine } from "../src/game/GameEngine";
import { InputManager } from "../src/game/InputManager";

describe("판정 시간 계산", () => {
  it("경계값을 설정대로 판정한다", () => {
    expect(judgeTiming(85)).toBe("Perfect");
    expect(judgeTiming(86)).toBe("Great");
    expect(judgeTiming(-150)).toBe("Great");
    expect(judgeTiming(151)).toBe("Good");
    expect(judgeTiming(225)).toBe("Good");
    expect(judgeTiming(226)).toBe("Bad");
    expect(judgeTiming(320)).toBe("Bad");
  });
});

describe("연타 입력 방지", () => {
  it("노트가 없는 위치의 입력을 Bad로 처리해 콤보를 끊는다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Anti spam",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 0, type: "tap" }],
    });

    expect(engine.press(0, 2)?.judgement).toBe("Perfect");
    expect(engine.score.combo).toBe(1);
    expect(engine.press(0, 2.05)?.judgement).toBe("Bad");
    expect(engine.score.combo).toBe(0);
    expect(engine.score.counts).toMatchObject({ Perfect: 1, Bad: 1 });
  });

  it("실제 노트를 누른 입력과 빈 레인 입력을 구분한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Matched note marker",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 0, type: "tap" }],
    });

    expect(engine.press(3, 2)?.matchedNote).not.toBe(true);
    expect(engine.press(0, 2)?.matchedNote).toBe(true);
  });

  it("판정 범위보다 너무 이른 입력도 Bad로 처리한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Early spam",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "easy",
      notes: [{ time: 3, lane: 1, type: "tap" }],
    });

    expect(engine.press(1, 2)?.judgement).toBe("Bad");
    expect(engine.score.counts.Bad).toBe(1);
  });

  it("누르지 않고 지나간 노트도 Bad로 기록한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Miss becomes Bad",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 1, type: "tap" }],
    });

    const events = engine.update(2.321, new Set());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ judgement: "Bad", lane: 1 });
    expect(events[0].deltaMs).toBeCloseTo(321);
    expect(engine.score.counts.Bad).toBe(1);
    expect(engine.score.combo).toBe(0);
  });

  it("같은 순간 놓친 모든 노트를 각각 Bad 이벤트로 반환한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Every miss becomes Bad",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [
        { time: 2, lane: 0, type: "tap" },
        { time: 2, lane: 2, type: "tap" },
      ],
    });

    const events = engine.update(2.321, new Set());
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.judgement)).toEqual(["Bad", "Bad"]);
    expect(events.map((event) => event.lane)).toEqual([0, 2]);
    expect(engine.score.counts.Bad).toBe(2);
  });

  it("롱노트를 끝까지 유지하지 못한 경우도 Bad로 기록한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Failed hold becomes Bad",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 0, type: "hold", duration: 1 }],
    });

    expect(engine.press(0, 2)).toMatchObject({
      judgement: "Perfect",
      displayJudgement: false,
    });
    expect(engine.update(3, new Set())).toEqual([{ judgement: "Bad", deltaMs: 0, lane: 0 }]);
    expect(engine.score.counts.Bad).toBe(1);
  });

  it("롱노트는 시작이 아니라 끝까지 누른 시점에 최종 판정을 표시한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Hold judgement at the tail",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 120,
      difficulty: "normal",
      notes: [{ time: 2, lane: 3, type: "hold", duration: 1 }],
    });

    expect(engine.press(3, 2)?.displayJudgement).toBe(false);
    const events = engine.update(3, new Set([3]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ judgement: "Perfect", lane: 3 });
    expect(events[0].displayJudgement).not.toBe(false);
  });
});

describe("빠른 동일 레인 입력", () => {
  it("새 keydown은 같은 레인에서도 즉시 다시 받아들이고 OS 자동 반복만 무시한다", () => {
    const input = new InputManager();
    expect(input.press("KeyZ", false)).toBe(0);
    expect(input.press("KeyZ", true)).toBeNull();
    expect(input.press("KeyZ", false)).toBe(0);
    expect(input.release("KeyZ")).toBe(0);
    expect(input.press("KeyZ", false)).toBe(0);
  });

  it("75ms 간격의 동일 레인 노트 두 개를 각각 판정한다", () => {
    const engine = new GameEngine();
    engine.load({
      title: "Fast jack",
      audio: "./audio/song.mp3",
      offset: 0,
      bpm: 180,
      difficulty: "hard",
      notes: [
        { time: 2, lane: 2, type: "tap" },
        { time: 2.075, lane: 2, type: "tap" },
      ],
    });

    expect(engine.press(2, 2)?.judgement).toBe("Perfect");
    expect(engine.press(2, 2.075)?.judgement).toBe("Perfect");
    expect(engine.score.counts.Perfect).toBe(2);
  });
});

describe("점수, 콤보, 정확도", () => {
  it("Bad에서 콤보를 초기화한다", () => {
    let state = createScoreState();
    state = applyJudgement(state, "Perfect");
    state = applyJudgement(state, "Great");
    expect(state.score).toBe(1700);
    expect(state.combo).toBe(2);
    state = applyJudgement(state, "Bad");
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

  it("롱노트가 유지되는 동안과 종료 직후 같은 레인의 노트를 제거한다", () => {
    const notes = sanitizeGeneratedNotes([
      { time: 2, lane: 0, type: "hold", duration: 1 },
      { time: 2.5, lane: 0, type: "tap" },
      { time: 3.2, lane: 0, type: "tap" },
      { time: 3.4, lane: 0, type: "tap" },
    ], "hard", 10);
    expect(notes.some((note: ChartNote) => note.type === "hold")).toBe(true);
    expect(notes.some((note: ChartNote) => note.time === 2.5)).toBe(false);
    expect(notes.some((note: ChartNote) => note.time === 3.2)).toBe(false);
    expect(notes.some((note: ChartNote) => note.time === 3.4)).toBe(true);
  });

  it("불러온 채보에서도 롱노트 뒤 같은 레인만 320ms 동안 비운다", () => {
    const notes = removePostHoldLaneConflicts([
      { time: 2, lane: 1, type: "hold", duration: 1 },
      { time: 3.1, lane: 1, type: "tap" },
      { time: 3.1, lane: 2, type: "tap" },
      { time: 3.33, lane: 1, type: "tap" },
    ]);
    expect(notes.some((note) => note.time === 3.1 && note.lane === 1)).toBe(false);
    expect(notes.some((note) => note.time === 3.1 && note.lane === 2)).toBe(true);
    expect(notes.some((note) => note.time === 3.33 && note.lane === 1)).toBe(true);
  });
});
