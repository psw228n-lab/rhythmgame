import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Difficulty, GameSettings, Judgement, SavedRecord } from "../game/types";

const RECORD_KEY = "afterglow.records.v2";
const SETTINGS_KEY = "afterglow.settings.v1";
const PLAYER_KEY = "afterglow.player-name.v1";
const SCORE_TABLE = "rhythm_scores";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

export interface ScoreSubmission {
  playerName: string;
  songId: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
}

export interface ScoreSubmissionResult {
  entryId: number;
  rank: number;
}

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  songId: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  createdAt: string;
}

type LocalRecords = Record<string, SavedRecord>;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function recordKey(songId: string, difficulty: Difficulty) {
  return `${songId}:${difficulty}`;
}

function sanitizePlayerName(value: string) {
  return value.replace(/[<>\n\r\t]/g, "").trim().slice(0, 16);
}

export const rankingService = {
  isCloudConfigured() {
    return Boolean(supabase);
  },

  getConfigMessage() {
    return supabase
      ? "Supabase 글로벌 랭킹 연결됨"
      : "Supabase 환경변수가 없어 글로벌 랭킹이 비활성화되었습니다.";
  },

  getLocalRecord(songId: string, difficulty: Difficulty) {
    return safeRead<LocalRecords>(RECORD_KEY, {})[recordKey(songId, difficulty)];
  },

  saveLocalRecord(songId: string, difficulty: Difficulty, record: SavedRecord) {
    const records = safeRead<LocalRecords>(RECORD_KEY, {});
    const key = recordKey(songId, difficulty);
    if (!records[key] || record.score > records[key].score) records[key] = record;
    localStorage.setItem(RECORD_KEY, JSON.stringify(records));
    return records[key];
  },

  getPlayerName() {
    return safeRead<string>(PLAYER_KEY, "");
  },

  savePlayerName(name: string) {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(sanitizePlayerName(name)));
  },

  async submitScore(submission: ScoreSubmission): Promise<ScoreSubmissionResult> {
    if (!supabase) throw new Error("Supabase 연결 정보가 없습니다. 배포 환경변수를 설정해 주세요.");
    const playerName = sanitizePlayerName(submission.playerName);
    if (playerName.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
    const payload = {
      player_name: playerName,
      song_id: submission.songId,
      difficulty: submission.difficulty,
      score: Math.max(0, Math.floor(submission.score)),
      accuracy: Number(submission.accuracy.toFixed(4)),
      max_combo: Math.max(0, Math.floor(submission.maxCombo)),
      perfect_count: submission.counts.Perfect,
      great_count: submission.counts.Great,
      good_count: submission.counts.Good,
      // 기존 Supabase 스키마의 miss_count 열을 Bad 횟수 저장용으로 재사용합니다.
      miss_count: submission.counts.Bad,
      grade: calculateGrade(submission.accuracy),
    };
    const { data, error } = await supabase
      .from(SCORE_TABLE)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`랭킹 등록 실패: ${error.message}`);
    const entryId = Number(data.id);
    if (!Number.isFinite(entryId)) throw new Error("등록된 점수의 순번을 확인하지 못했습니다.");

    const [higherScore, higherAccuracy, earlierTie] = await Promise.all([
      supabase
        .from(SCORE_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("song_id", submission.songId)
        .eq("difficulty", submission.difficulty)
        .gt("score", payload.score),
      supabase
        .from(SCORE_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("song_id", submission.songId)
        .eq("difficulty", submission.difficulty)
        .eq("score", payload.score)
        .gt("accuracy", payload.accuracy),
      supabase
        .from(SCORE_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("song_id", submission.songId)
        .eq("difficulty", submission.difficulty)
        .eq("score", payload.score)
        .eq("accuracy", payload.accuracy)
        .lt("id", entryId),
    ]);
    const rankError = higherScore.error ?? higherAccuracy.error ?? earlierTie.error;
    if (rankError) throw new Error(`등수 계산 실패: ${rankError.message}`);
    const rank = 1 + (higherScore.count ?? 0) + (higherAccuracy.count ?? 0) + (earlierTie.count ?? 0);
    this.savePlayerName(playerName);
    return { entryId, rank };
  },

  async getLeaderboard(songId: string, difficulty: Difficulty, limit = 20): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(SCORE_TABLE)
      .select("id,player_name,song_id,difficulty,score,accuracy,max_combo,grade,created_at")
      .eq("song_id", songId)
      .eq("difficulty", difficulty)
      .order("score", { ascending: false })
      .order("accuracy", { ascending: false })
      .order("id", { ascending: true })
      .limit(Math.max(1, Math.min(50, limit)));
    if (error) throw new Error(`랭킹 조회 실패: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      playerName: String(row.player_name),
      songId: String(row.song_id),
      difficulty: row.difficulty as Difficulty,
      score: Number(row.score),
      accuracy: Number(row.accuracy),
      maxCombo: Number(row.max_combo),
      rank: String(row.grade),
      createdAt: String(row.created_at),
    }));
  },

  getSettings(fallback: GameSettings) {
    return { ...fallback, ...safeRead<Partial<GameSettings>>(SETTINGS_KEY, {}) };
  },

  saveSettings(settings: GameSettings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
};

function calculateGrade(accuracy: number) {
  if (accuracy >= 95) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 80) return "B";
  if (accuracy >= 70) return "C";
  return "D";
}
