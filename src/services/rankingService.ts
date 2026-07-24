import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Difficulty, GameSettings, Judgement, SavedRecord } from "../game/types";

const RECORD_KEY = "afterglow.records.v2";
const SETTINGS_KEY = "afterglow.settings.v1";
const PLAYER_KEY = "afterglow.player-name.v1";
const SCORE_TABLE = "rhythm_scores";
const PLAYER_TABLE = "rhythm_players";
const BEST_SCORE_VIEW = "rhythm_leaderboard_best";
const PAGE_SIZE = 1000;

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
  position: number;
  playerName: string;
  songId: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  createdAt: string;
}

interface ScoreRow {
  id: number | string;
  player_name: string;
  song_id: string;
  difficulty: string;
  score: number | string;
  accuracy: number | string;
  max_combo: number | string;
  grade: string;
  created_at: string;
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

export function sanitizePlayerName(value: string) {
  return value.replace(/[<>\n\r\t]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
}

export function normalizePlayerName(value: string) {
  return sanitizePlayerName(value).toLocaleLowerCase("ko-KR");
}

function validatePlayerName(value: string) {
  const playerName = sanitizePlayerName(value);
  if (playerName.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
  return playerName;
}

function mapScoreRow(row: ScoreRow): LeaderboardEntry {
  return {
    id: Number(row.id),
    position: 0,
    playerName: String(row.player_name),
    songId: String(row.song_id),
    difficulty: row.difficulty as Difficulty,
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    maxCombo: Number(row.max_combo),
    rank: String(row.grade),
    createdAt: String(row.created_at),
  };
}

function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry) {
  return right.score - left.score || right.accuracy - left.accuracy || left.id - right.id;
}

export function keepPlayerBestScores(entries: LeaderboardEntry[]) {
  const bestByPlayer = new Map<string, LeaderboardEntry>();
  for (const entry of entries) {
    const key = normalizePlayerName(entry.playerName);
    const previous = bestByPlayer.get(key);
    if (!previous || compareEntries(entry, previous) < 0) bestByPlayer.set(key, entry);
  }
  return [...bestByPlayer.values()].sort(compareEntries);
}

function isMissingRelation(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

async function loadAllScoreRows(songId: string, difficulty: Difficulty) {
  if (!supabase) return [];
  const rows: ScoreRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(SCORE_TABLE)
      .select("id,player_name,song_id,difficulty,score,accuracy,max_combo,grade,created_at")
      .eq("song_id", songId)
      .eq("difficulty", difficulty)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`랭킹 조회 실패: ${error.message}`);
    const page = (data ?? []) as ScoreRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadBestEntries(songId: string, difficulty: Difficulty) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(BEST_SCORE_VIEW)
    .select("id,player_name,song_id,difficulty,score,accuracy,max_combo,grade,created_at")
    .eq("song_id", songId)
    .eq("difficulty", difficulty)
    .order("score", { ascending: false })
    .order("accuracy", { ascending: false })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);

  let entries: LeaderboardEntry[];
  if (error) {
    if (!isMissingRelation(error)) throw new Error(`랭킹 조회 실패: ${error.message}`);
    entries = (await loadAllScoreRows(songId, difficulty)).map(mapScoreRow);
  } else {
    entries = ((data ?? []) as ScoreRow[]).map(mapScoreRow);
  }

  return keepPlayerBestScores(entries).map((entry, index) => ({ ...entry, position: index + 1 }));
}

async function playerNameExistsInScores(playerName: string) {
  if (!supabase) return false;
  const target = normalizePlayerName(playerName);
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(SCORE_TABLE)
      .select("player_name")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`닉네임 확인 실패: ${error.message}`);
    const page = (data ?? []) as Array<{ player_name: string }>;
    if (page.some((row) => normalizePlayerName(row.player_name) === target)) return true;
    if (page.length < PAGE_SIZE) return false;
  }
}

async function reservePlayerName(playerName: string, allowExisting: boolean) {
  if (!supabase) return;
  const { error } = await supabase.from(PLAYER_TABLE).insert({ player_name: playerName });
  if (!error) return;
  if (error.code === "23505") {
    if (allowExisting) return;
    throw new Error("이미 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.");
  }
  if (isMissingRelation(error)) {
    if (!allowExisting && await playerNameExistsInScores(playerName)) {
      throw new Error("이미 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.");
    }
    return;
  }
  throw new Error(`닉네임 등록 실패: ${error.message}`);
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

  async claimPlayerName(name: string) {
    const playerName = validatePlayerName(name);
    const currentName = this.getPlayerName();
    if (currentName && normalizePlayerName(currentName) === normalizePlayerName(playerName)) {
      this.savePlayerName(playerName);
      return playerName;
    }
    await reservePlayerName(playerName, false);
    this.savePlayerName(playerName);
    return playerName;
  },

  async submitScore(submission: ScoreSubmission): Promise<ScoreSubmissionResult> {
    if (!supabase) throw new Error("Supabase 연결 정보가 없습니다. 배포 환경변수를 설정해 주세요.");
    const playerName = validatePlayerName(submission.playerName);
    await reservePlayerName(playerName, true);
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

    const playerEntry = (await loadBestEntries(submission.songId, submission.difficulty))
      .find((entry) => normalizePlayerName(entry.playerName) === normalizePlayerName(playerName));
    const rank = playerEntry?.position ?? 1;
    this.savePlayerName(playerName);
    return { entryId, rank };
  },

  async getLeaderboard(songId: string, difficulty: Difficulty, limit = 20, playerName?: string): Promise<LeaderboardEntry[]> {
    const entries = await loadBestEntries(songId, difficulty);
    if (playerName) {
      const target = normalizePlayerName(playerName);
      return entries.filter((entry) => normalizePlayerName(entry.playerName) === target);
    }
    return entries.slice(0, Math.max(1, Math.min(50, limit)));
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
