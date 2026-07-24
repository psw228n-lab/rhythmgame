import { describe, expect, it } from "vitest";
import {
  keepPlayerBestScores,
  normalizePlayerName,
  type LeaderboardEntry,
} from "../src/services/rankingService";

function entry(id: number, playerName: string, score: number, accuracy: number): LeaderboardEntry {
  return {
    id,
    position: 0,
    playerName,
    songId: "song",
    difficulty: "normal",
    score,
    accuracy,
    maxCombo: 10,
    rank: "A",
    createdAt: "2026-07-24T00:00:00.000Z",
  };
}

describe("leaderboard player grouping", () => {
  it("같은 플레이어는 가장 높은 점수 하나만 남긴다", () => {
    const result = keepPlayerBestScores([
      entry(1, "Player", 1000, 90),
      entry(2, "Player", 2500, 80),
      entry(3, "Other", 2000, 95),
    ]);

    expect(result.map((score) => [score.playerName, score.score])).toEqual([
      ["Player", 2500],
      ["Other", 2000],
    ]);
  });

  it("대소문자와 앞뒤 공백이 달라도 같은 닉네임으로 취급한다", () => {
    const result = keepPlayerBestScores([
      entry(1, "AfterGlow", 1000, 90),
      entry(2, " afterglow ", 1200, 91),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(normalizePlayerName(" AfterGlow ")).toBe("afterglow");
  });

  it("점수가 같으면 정확도가 높은 기록을 선택한다", () => {
    const result = keepPlayerBestScores([
      entry(1, "Player", 2000, 91),
      entry(2, "Player", 2000, 97),
    ]);

    expect(result[0].id).toBe(2);
  });
});
