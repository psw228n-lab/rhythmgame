"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SongDefinition } from "../game/types";

interface Props {
  songs: SongDefinition[];
  selectedId: string | null;
  onSelect: (song: SongDefinition) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  moved: boolean;
}

export default function SongSelect({ songs, selectedId, onSelect }: Props) {
  const selectedIndex = Math.max(0, songs.findIndex((song) => song.id === selectedId));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [dragX, setDragX] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const dragRef = useRef<DragState>({ pointerId: -1, startX: 0, moved: false });
  const ignoreClickRef = useRef(false);

  const playPreview = useCallback((index: number) => {
    const song = songs[index];
    if (!song || typeof window === "undefined") return;
    const audio = previewRef.current ?? new Audio();
    previewRef.current = audio;
    audio.preload = "auto";
    audio.volume = 0.22;

    if (audio.dataset.songId === song.id && !audio.paused) return;
    audio.pause();
    audio.dataset.songId = song.id;
    audio.src = new URL(song.previewAudio, window.location.href).toString();
    audio.load();

    const seekToPreview = () => {
      const latestSong = songs[index];
      if (!latestSong || audio.dataset.songId !== latestSong.id) return;
      const latestAllowedStart = Math.max(0, (audio.duration || latestSong.duration) - 1);
      audio.currentTime = Math.min(latestSong.previewStart, latestAllowedStart);
    };

    if (audio.readyState >= 1) {
      seekToPreview();
    } else {
      audio.addEventListener("loadedmetadata", seekToPreview, { once: true });
    }

    audio.ontimeupdate = () => {
      if (audio.dataset.songId !== song.id) return;
      if (audio.currentTime >= song.previewStart + song.previewLength) {
        audio.currentTime = song.previewStart;
      }
    };

    void audio.play()
      .then(() => setPreviewPlaying(true))
      .catch(() => setPreviewPlaying(false));
  }, [songs]);

  useEffect(() => {
    if (!songs.length) return;
    setActiveIndex((current) => Math.min(current, songs.length - 1));
  }, [songs.length]);

  useEffect(() => {
    playPreview(activeIndex);
  }, [activeIndex, playPreview]);

  useEffect(() => {
    const unlockPreview = () => playPreview(activeIndex);
    window.addEventListener("pointerdown", unlockPreview, { capture: true, once: true });
    return () => window.removeEventListener("pointerdown", unlockPreview, { capture: true });
  }, [activeIndex, playPreview]);

  useEffect(() => () => {
    if (!previewRef.current) return;
    previewRef.current.pause();
    previewRef.current.removeAttribute("src");
    previewRef.current.load();
  }, []);

  const activate = (nextIndex: number) => {
    if (!songs.length) return;
    const normalized = (nextIndex + songs.length) % songs.length;
    setActiveIndex(normalized);
    setDragX(0);
    playPreview(normalized);
  };

  const relativeOffset = (index: number) => {
    if (songs.length <= 1) return 0;
    let offset = index - activeIndex;
    const half = songs.length / 2;
    if (offset > half) offset -= songs.length;
    if (offset < -half) offset += songs.length;
    return offset;
  };

  const finishDrag = (clientX: number) => {
    const state = dragRef.current;
    if (state.pointerId < 0) return;
    const distance = clientX - state.startX;
    const moved = Math.abs(distance) > 10;
    ignoreClickRef.current = moved;
    dragRef.current = { pointerId: -1, startX: 0, moved: false };
    if (Math.abs(distance) >= 64) {
      activate(activeIndex + (distance < 0 ? 1 : -1));
    } else {
      setDragX(0);
    }
    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 0);
  };

  const activeSong = songs[activeIndex];

  return (
    <section className="song-select-shell coverflow-shell" aria-labelledby="song-select-title">
      <div className="song-select-heading coverflow-heading">
        <span className="eyebrow">MUSIC ARCHIVE / {songs.length.toString().padStart(2, "0")}</span>
        <h1 id="song-select-title">Select track</h1>
        <p>앨범을 좌우로 넘겨 중앙에 놓고, 중앙 앨범을 클릭하면 플레이 화면으로 이동합니다.</p>
      </div>

      <div className="coverflow">
        <button className="coverflow-arrow coverflow-arrow-left" type="button" onClick={() => activate(activeIndex - 1)} aria-label="이전 앨범 보기">‹</button>
        <div
          className={`coverflow-stage ${dragRef.current.pointerId >= 0 ? "is-dragging" : ""}`}
          role="group"
          aria-label="드래그 가능한 앨범 선택"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            playPreview(activeIndex);
            dragRef.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragRef.current.pointerId !== event.pointerId) return;
            const distance = event.clientX - dragRef.current.startX;
            dragRef.current.moved ||= Math.abs(distance) > 10;
            setDragX(Math.max(-180, Math.min(180, distance)));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finishDrag(event.clientX);
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finishDrag(event.clientX);
          }}
        >
          {songs.map((song, index) => {
            const offset = relativeOffset(index);
            const distance = Math.abs(offset);
            const center = offset === 0;
            const x = offset * 330 + dragX;
            const scale = center ? 1 : Math.max(0.66, 0.82 - (distance - 1) * 0.1);
            const rotateY = center ? 0 : offset < 0 ? 12 : -12;
            return (
              <article
                className={`song-card coverflow-card ${center ? "selected is-center" : "is-side"}`}
                key={song.id}
                style={{
                  "--song-accent": song.accent,
                  zIndex: 20 - distance,
                  opacity: distance > 2 ? 0 : Math.max(0.34, 1 - distance * 0.24),
                  pointerEvents: distance > 2 ? "none" : "auto",
                  transform: `translate3d(calc(-50% + ${x}px), ${distance * 34}px, ${-distance * 130}px) rotateY(${rotateY}deg) scale(${scale})`,
                } as React.CSSProperties}
                role="button"
                tabIndex={center ? 0 : -1}
                aria-label={`${song.artist}의 ${song.title}${center ? " 플레이" : " 중앙으로 이동"}`}
                aria-current={center ? "true" : undefined}
                onClick={() => {
                  if (ignoreClickRef.current) return;
                  if (center) onSelect(song);
                  else activate(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (center) onSelect(song);
                    else activate(index);
                  }
                }}
              >
                <div className="song-art" aria-hidden="true">
                  <img src={song.cover} alt="" draggable={false} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="song-card-copy">
                  <span className="eyebrow">{center ? "NOW PREVIEWING" : "AVAILABLE TRACK"}</span>
                  <h2>{song.title}</h2>
                  <p>{song.artist}</p>
                  <div className="song-specs">
                    <span><b>{song.bpm}</b> BPM</span>
                    <span><b>{formatDuration(song.fadeOutAt + song.fadeOutDuration)}</b> PLAY TIME</span>
                    <span><b>3</b> DIFFICULTIES</span>
                  </div>
                  <span className="button button-primary">{center ? "CLICK TO PLAY" : "BRING TO CENTER"}</span>
                </div>
              </article>
            );
          })}
        </div>
        <button className="coverflow-arrow coverflow-arrow-right" type="button" onClick={() => activate(activeIndex + 1)} aria-label="다음 앨범 보기">›</button>
      </div>

      {activeSong && (
        <div className={`preview-status ${previewPlaying ? "is-playing" : ""}`} aria-live="polite">
          <span />
          <strong>{previewPlaying ? "PREVIEW PLAYING" : "INTERACT TO START PREVIEW"}</strong>
          <em>{activeSong.artist} · {activeSong.title} · {formatDuration(activeSong.previewStart)}부터</em>
        </div>
      )}
      <p className="carousel-hint">반투명 화살표 또는 마우스 드래그로 이동하세요.</p>
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
