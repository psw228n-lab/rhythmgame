export type Difficulty = "easy" | "normal" | "hard";
export type NoteType = "tap" | "hold";
export type Judgement = "Perfect" | "Great" | "Good" | "Bad";

export interface ChartNote {
  time: number;
  lane: number;
  type: NoteType;
  duration?: number;
}

export interface Chart {
  title: string;
  audio: string;
  offset: number;
  bpm: number;
  difficulty: Difficulty;
  notes: ChartNote[];
  analysis?: {
    duration: number;
    firstSound: number;
    generatedAt: string;
  };
}

export interface SongDefinition {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  accent: string;
  cover: string;
  fadeOutAt: number;
  fadeOutDuration: number;
  charts: Record<Difficulty, string>;
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
}

export interface GameSettings {
  volume: number;
  noteSpeed: number;
  audioOffset: number;
}

export interface SavedRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  playedAt: string;
}
