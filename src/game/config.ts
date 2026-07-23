import type { Difficulty, GameSettings, Judgement } from "./types";

// 판정과 점수는 이 파일만 수정하면 게임 전체에 반영됩니다.
export const JUDGEMENT_WINDOWS: Record<Judgement, number> = {
  Perfect: 45,
  Great: 90,
  Good: 140,
  Miss: Number.POSITIVE_INFINITY,
};

export const SCORE_VALUES: Record<Judgement, number> = {
  Perfect: 1000,
  Great: 700,
  Good: 300,
  Miss: 0,
};

export const ACCURACY_WEIGHTS: Record<Judgement, number> = {
  Perfect: 1,
  Great: 0.7,
  Good: 0.3,
  Miss: 0,
};

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.72,
  noteSpeed: 1,
  audioOffset: 0,
};

export const DIFFICULTY_LIMITS: Record<
  Difficulty,
  { minGap: number; maxNotesPerSecond: number }
> = {
  easy: { minGap: 0.3, maxNotesPerSecond: 2.4 },
  normal: { minGap: 0.14, maxNotesPerSecond: 4.5 },
  hard: { minGap: 0.075, maxNotesPerSecond: 7.2 },
};

export const LANE_CODES = ["KeyZ", "KeyX", "KeyC", "KeyV"] as const;
export const LANE_LABELS = ["Z", "X", "C", "V"] as const;
export const LANE_COLORS = ["#ff3d81", "#ffb627", "#21e6c1", "#7b61ff"] as const;
