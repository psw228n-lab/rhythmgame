import { ACCURACY_WEIGHTS, JUDGEMENT_WINDOWS, SCORE_VALUES } from "./config";
import type { Judgement, ScoreState } from "./types";

export const createScoreState = (): ScoreState => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: { Perfect: 0, Great: 0, Good: 0, Bad: 0 },
});

// 입력과 노트의 시간차를 밀리초로 받아 판정 이름을 돌려줍니다.
export function judgeTiming(deltaMs: number): Judgement {
  const distance = Math.abs(deltaMs);
  if (distance <= JUDGEMENT_WINDOWS.Perfect) return "Perfect";
  if (distance <= JUDGEMENT_WINDOWS.Great) return "Great";
  if (distance <= JUDGEMENT_WINDOWS.Good) return "Good";
  return "Bad";
}

export function applyJudgement(state: ScoreState, judgement: Judgement): ScoreState {
  const combo = judgement === "Bad" ? 0 : state.combo + 1;
  return {
    score: state.score + SCORE_VALUES[judgement],
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    counts: { ...state.counts, [judgement]: state.counts[judgement] + 1 },
  };
}

export function calculateAccuracy(state: ScoreState): number {
  const total = Object.values(state.counts).reduce((sum, value) => sum + value, 0);
  if (!total) return 100;
  const weighted = (Object.keys(state.counts) as Judgement[]).reduce(
    (sum, key) => sum + state.counts[key] * ACCURACY_WEIGHTS[key],
    0,
  );
  return (weighted / total) * 100;
}

export function calculateRank(accuracy: number): string {
  if (accuracy >= 95) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 80) return "B";
  if (accuracy >= 70) return "C";
  return "D";
}
