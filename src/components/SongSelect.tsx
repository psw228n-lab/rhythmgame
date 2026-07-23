"use client";

import type { SongDefinition } from "../game/types";

interface Props {
  songs: SongDefinition[];
  selectedId: string | null;
  onSelect: (song: SongDefinition) => void;
}

export default function SongSelect({ songs, selectedId, onSelect }: Props) {
  return (
    <section className="song-select-shell" aria-labelledby="song-select-title">
      <div className="song-select-heading">
        <span className="eyebrow">MUSIC ARCHIVE / {songs.length.toString().padStart(2, "0")}</span>
        <h1 id="song-select-title">Select track</h1>
        <p>곡을 선택한 뒤 난이도와 싱크를 조절해 플레이하세요. `public/songs.json`에 항목을 추가하면 이 화면에 자동으로 표시됩니다.</p>
      </div>
      <div className="song-catalog">
        {songs.map((song, index) => (
          <article
            className={`song-card ${selectedId === song.id ? "selected" : ""}`}
            key={song.id}
            style={{ "--song-accent": song.accent } as React.CSSProperties}
          >
            <div className="song-art" aria-hidden="true">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>A</strong>
              <i />
            </div>
            <div className="song-card-copy">
              <span className="eyebrow">AVAILABLE TRACK</span>
              <h2>{song.title}</h2>
              <p>{song.artist}</p>
              <div className="song-specs">
                <span><b>{song.bpm}</b> BPM</span>
                <span><b>{formatDuration(song.duration)}</b> LENGTH</span>
                <span><b>3</b> DIFFICULTIES</span>
              </div>
              <button className="button button-primary" onClick={() => onSelect(song)}>
                {selectedId === song.id ? "SELECTED · PLAY" : "SELECT & PLAY"}
              </button>
            </div>
          </article>
        ))}
        <article className="song-card coming-soon" aria-disabled="true">
          <div className="song-art"><strong>+</strong></div>
          <div className="song-card-copy"><span className="eyebrow">EXPANSION SLOT</span><h2>New signal</h2><p>곡과 채보를 추가하면 자동으로 활성화됩니다.</p></div>
        </article>
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
