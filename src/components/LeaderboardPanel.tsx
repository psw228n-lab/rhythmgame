"use client";

import { useEffect, useState } from "react";
import type { Difficulty, SongDefinition } from "../game/types";
import { rankingService, type LeaderboardEntry } from "../services/rankingService";

interface Props { songs: SongDefinition[]; initialSongId?: string; refreshKey?: number; }

export default function LeaderboardPanel({ songs, initialSongId, refreshKey = 0 }: Props) {
  const [songId, setSongId] = useState(initialSongId ?? songs[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState("랭킹을 불러오는 중입니다.");
  const [showMine, setShowMine] = useState(false);
  const playerName = rankingService.getPlayerName();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!songId) return;
      if (!rankingService.isCloudConfigured()) {
        setEntries([]);
        setStatus(rankingService.getConfigMessage());
        return;
      }
      setStatus("랭킹을 불러오는 중입니다.");
      try {
        const data = await rankingService.getLeaderboard(songId, difficulty, 20, showMine ? playerName : undefined);
        if (!cancelled) {
          setEntries(data);
          setStatus(
            data.length
              ? showMine
                ? `${playerName}님의 개인 최고 기록`
                : `플레이어별 최고 기록 ${data.length}개`
              : showMine
                ? "이 곡과 난이도에는 아직 내 기록이 없습니다."
                : "아직 등록된 기록이 없습니다. 첫 기록을 남겨보세요.",
          );
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "랭킹을 불러오지 못했습니다.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [difficulty, playerName, refreshKey, showMine, songId]);

  return (
    <section className="leaderboard-shell" aria-labelledby="leaderboard-title">
      <div className="leaderboard-heading">
        <div><span className="eyebrow">GLOBAL SCORE NETWORK</span><h1 id="leaderboard-title">Leaderboard</h1></div>
        <div className={`cloud-indicator ${rankingService.isCloudConfigured() ? "online" : ""}`}><span />{rankingService.getConfigMessage()}</div>
      </div>
      <div className="leaderboard-filters">
        <label>TRACK<select value={songId} onChange={(event) => setSongId(event.target.value)}>{songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label>
        <label>DIFFICULTY<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
        <button
          className={`button leaderboard-mine-button ${showMine ? "is-active" : ""}`}
          type="button"
          aria-pressed={showMine}
          onClick={() => setShowMine((value) => !value)}
          disabled={!playerName || !rankingService.isCloudConfigured()}
        >
          {showMine ? "전체 랭킹 보기" : "내 점수 보기"}
        </button>
      </div>
      <div className="leaderboard-table" role="table" aria-label="글로벌 랭킹">
        <div className="leaderboard-row header" role="row"><span>#</span><span>PLAYER</span><span>SCORE</span><span>ACC</span><span>COMBO</span><span>GRADE</span></div>
        {entries.map((entry) => (
          <div className={`leaderboard-row ${entry.position <= 3 ? `podium podium-${entry.position}` : ""} ${showMine ? "is-mine" : ""}`} role="row" key={entry.id}>
            <span>{String(entry.position).padStart(2, "0")}</span><strong>{entry.playerName}</strong><b>{entry.score.toLocaleString()}</b><span>{entry.accuracy.toFixed(2)}%</span><span>{entry.maxCombo}</span><em>{entry.rank}</em>
          </div>
        ))}
        {!entries.length && <div className="leaderboard-empty">{status}</div>}
      </div>
      {entries.length > 0 && <p className="leaderboard-status">{status}</p>}
    </section>
  );
}
