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
        const data = await rankingService.getLeaderboard(songId, difficulty);
        if (!cancelled) {
          setEntries(data);
          setStatus(data.length ? `${data.length}개의 기록` : "아직 등록된 기록이 없습니다. 첫 기록을 남겨보세요.");
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "랭킹을 불러오지 못했습니다.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [difficulty, refreshKey, songId]);

  return (
    <section className="leaderboard-shell" aria-labelledby="leaderboard-title">
      <div className="leaderboard-heading">
        <div><span className="eyebrow">GLOBAL SCORE NETWORK</span><h1 id="leaderboard-title">Leaderboard</h1></div>
        <div className={`cloud-indicator ${rankingService.isCloudConfigured() ? "online" : ""}`}><span />{rankingService.getConfigMessage()}</div>
      </div>
      <div className="leaderboard-filters">
        <label>TRACK<select value={songId} onChange={(event) => setSongId(event.target.value)}>{songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label>
        <label>DIFFICULTY<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
      </div>
      <div className="leaderboard-table" role="table" aria-label="글로벌 랭킹">
        <div className="leaderboard-row header" role="row"><span>#</span><span>PLAYER</span><span>SCORE</span><span>ACC</span><span>COMBO</span><span>GRADE</span></div>
        {entries.map((entry, index) => (
          <div className={`leaderboard-row ${index < 3 ? `podium podium-${index + 1}` : ""}`} role="row" key={entry.id}>
            <span>{String(index + 1).padStart(2, "0")}</span><strong>{entry.playerName}</strong><b>{entry.score.toLocaleString()}</b><span>{entry.accuracy.toFixed(2)}%</span><span>{entry.maxCombo}</span><em>{entry.rank}</em>
          </div>
        ))}
        {!entries.length && <div className="leaderboard-empty">{status}</div>}
      </div>
      {entries.length > 0 && <p className="leaderboard-status">{status}</p>}
    </section>
  );
}
