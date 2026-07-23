import { DIFFICULTY_LIMITS } from "./config";
import type { Chart, ChartNote, Difficulty } from "./types";

export function validateChart(value: unknown): value is Chart {
  if (!value || typeof value !== "object") return false;
  const chart = value as Partial<Chart>;
  if (
    typeof chart.title !== "string" ||
    typeof chart.audio !== "string" ||
    typeof chart.offset !== "number" ||
    typeof chart.bpm !== "number" ||
    !["easy", "normal", "hard"].includes(chart.difficulty ?? "") ||
    !Array.isArray(chart.notes)
  ) {
    return false;
  }
  return chart.notes.every(
    (note) =>
      note &&
      typeof note.time === "number" &&
      Number.isFinite(note.time) &&
      Number.isInteger(note.lane) &&
      note.lane >= 0 &&
      note.lane <= 3 &&
      (note.type === "tap" || note.type === "hold") &&
      (note.type === "tap" ||
        (typeof note.duration === "number" && note.duration > 0)),
  );
}

// 자동 생성 또는 에디터 입력 결과를 사람이 누를 수 있는 형태로 정리합니다.
export function postProcessNotes(
  notes: ChartNote[],
  difficulty: Difficulty,
  duration = Number.POSITIVE_INFINITY,
): ChartNote[] {
  const { minGap, maxNotesPerSecond } = DIFFICULTY_LIMITS[difficulty];
  const sorted = notes
    .filter(
      (note) =>
        Number.isFinite(note.time) &&
        note.time >= 1.5 &&
        note.time < duration - 0.15 &&
        Number.isInteger(note.lane) &&
        note.lane >= 0 &&
        note.lane <= 3 &&
        (note.type === "tap" || note.type === "hold"),
    )
    .sort((a, b) => a.time - b.time || a.lane - b.lane);

  const result: ChartNote[] = [];
  const recentTimes: number[] = [];
  let sameLaneRun = 0;
  let previousLane = -1;

  for (const source of sorted) {
    const note = { ...source, time: Number(source.time.toFixed(4)) };
    const duplicate = result.some(
      (item) => item.lane === note.lane && Math.abs(item.time - note.time) < 0.035,
    );
    if (duplicate) continue;

    const simultaneous = result.filter((item) => Math.abs(item.time - note.time) < 0.018);
    if (simultaneous.length >= 2) continue;

    const lastDifferentTime = [...result]
      .reverse()
      .find((item) => Math.abs(item.time - note.time) >= 0.018)?.time;
    if (lastDifferentTime !== undefined && note.time - lastDifferentTime < minGap) continue;

    while (recentTimes.length && note.time - recentTimes[0] > 1) recentTimes.shift();
    if (recentTimes.length >= Math.floor(maxNotesPerSecond)) continue;

    if (note.lane === previousLane) sameLaneRun += 1;
    else sameLaneRun = 1;
    if (sameLaneRun > 3) {
      note.lane = (note.lane + 1 + (result.length % 2)) % 4;
      sameLaneRun = 1;
    }

    if (note.type === "hold") {
      const safeDuration = Math.max(0.28, Math.min(note.duration ?? 0.5, duration - note.time - 0.1));
      note.duration = Number(safeDuration.toFixed(3));
    } else {
      delete note.duration;
    }

    result.push(note);
    recentTimes.push(note.time);
    previousLane = note.lane;
  }
  return result;
}
