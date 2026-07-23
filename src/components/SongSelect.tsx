"use client";

import { useRef } from "react";
import type { SongDefinition } from "../game/types";

interface Props {
  songs: SongDefinition[];
  selectedId: string | null;
  onSelect: (song: SongDefinition) => void;
}

export default function SongSelect({ songs, selectedId, onSelect }: Props) {
  const catalogRef = useRef<HTMLDivElement>(null);

  const scrollCatalog = (direction: -1 | 1) => {
    const catalog = catalogRef.current;
    if (!catalog) return;
    catalog.scrollBy({
      left: direction * Math.max(320, catalog.clientWidth * 0.78),
      behavior: "smooth",
    });
  };

  return (
    <section className="song-select-shell" aria-labelledby="song-select-title">
      <div className="song-select-heading">
        <span className="eyebrow">MUSIC ARCHIVE / {songs.length.toString().padStart(2, "0")}</span>
        <h1 id="song-select-title">Select track</h1>
        <p>곡을 선택한 뒤 난이도와 싱크를 조절해 플레이하세요. `public/songs.json`에 항목을 추가하면 이 화면에 자동으로 표시됩니다.</p>
      </div>
      <div className="song-carousel">
        <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => scrollCatalog(-1)} aria-label="이전 앨범 보기">←</button>
        <div
          className="song-catalog"
          ref={catalogRef}
          tabIndex={0}
          aria-label="가로 스크롤 곡 목록"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.currentTarget.scrollLeft += event.deltaY;
            }
          }}
        >
          {songs.map((song, index) => (
            <article
              className={`song-card ${selectedId === song.id ? "selected" : ""}`}
              key={song.id}
              style={{ "--song-accent": song.accent } as React.CSSProperties}
              role="button"
              tabIndex={0}
              aria-label={`${song.artist}의 ${song.title} 선택`}
              onClick={() => onSelect(song)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(song);
                }
              }}
            >
              <div className="song-art" aria-hidden="true">
                <img src={song.cover} alt="" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="song-card-copy">
                <span className="eyebrow">AVAILABLE TRACK</span>
                <h2>{song.title}</h2>
                <p>{song.artist}</p>
                <div className="song-specs">
                  <span><b>{song.bpm}</b> BPM</span>
                  <span><b>{formatDuration(song.fadeOutAt + song.fadeOutDuration)}</b> PLAY TIME</span>
                  <span><b>3</b> DIFFICULTIES</span>
                </div>
                <span className="button button-primary">
                  {selectedId === song.id ? "SELECTED · PLAY" : "SELECT & PLAY"}
                </span>
              </div>
            </article>
          ))}
          <article className="song-card coming-soon" aria-disabled="true">
            <div className="song-art"><strong>+</strong></div>
            <div className="song-card-copy"><span className="eyebrow">EXPANSION SLOT</span><h2>New signal</h2><p>곡과 채보를 추가하면 자동으로 활성화됩니다.</p></div>
          </article>
        </div>
        <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => scrollCatalog(1)} aria-label="다음 앨범 보기">→</button>
      </div>
      <p className="carousel-hint">좌우 버튼이나 트랙패드로 이동하고, 앨범을 클릭해 플레이하세요.</p>
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
