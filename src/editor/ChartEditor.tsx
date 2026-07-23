"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LANE_CODES, LANE_COLORS, LANE_LABELS } from "../game/config";
import { postProcessNotes, validateChart } from "../game/chartUtils";
import type { AudioManager } from "../game/AudioManager";
import type { Chart, ChartNote } from "../game/types";

interface Props {
  audio: AudioManager;
  chart: Chart;
  onChartChange: (chart: Chart) => void;
  onMessage: (message: string) => void;
}

export default function ChartEditor({ audio, chart, onChartChange, onMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<ChartNote[]>(() => chart.notes.map((note) => ({ ...note })));
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [offset, setOffset] = useState(chart.offset);
  const [now, setNow] = useState(audio.currentTime);

  useEffect(() => {
    setNotes(chart.notes.map((note) => ({ ...note })));
    setOffset(chart.offset);
    setSelected(null);
  }, [chart]);

  const commit = useCallback(
    (nextNotes: ChartNote[], nextOffset = offset) => {
      const sorted = [...nextNotes].sort((a, b) => a.time - b.time || a.lane - b.lane);
      setNotes(sorted);
      onChartChange({ ...chart, offset: nextOffset, notes: sorted });
    },
    [chart, offset, onChartChange],
  );

  useEffect(() => {
    let frame = 0;
    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) drawTimeline(canvas, notes, audio.currentTime, selected);
      setNow(audio.currentTime);
      if (loop && audio.currentTime >= Math.floor(audio.currentTime / 4) * 4 + 3.95) {
        audio.seek(Math.floor(audio.currentTime / 4) * 4);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [audio, loop, notes, selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const lane = LANE_CODES.indexOf(event.code as (typeof LANE_CODES)[number]);
      if (lane < 0) return;
      event.preventDefault();
      const note: ChartNote = { time: Number(audio.currentTime.toFixed(4)), lane, type: "tap" };
      const next = [...notes, note];
      commit(next);
      setSelected(next.length - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [audio, commit, notes]);

  const togglePlayback = async () => {
    try {
      if (audio.paused) {
        audio.element.playbackRate = playbackRate;
        await audio.play();
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "오디오를 재생할 수 없습니다.");
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const lane = Math.max(0, Math.min(3, Math.floor((y / rect.height) * 4)));
    const targetTime = Math.max(0, audio.currentTime + ((x / rect.width) * 8 - 4));
    const closest = notes
      .map((note, index) => ({ index, distance: Math.abs(note.time - targetTime), lane: note.lane }))
      .filter((item) => item.lane === lane && item.distance < 0.12)
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest) {
      setSelected(closest.index);
      return;
    }
    const next = [...notes, { time: Number(targetTime.toFixed(4)), lane, type: "tap" as const }];
    commit(next);
    setSelected(next.length - 1);
  };

  const updateSelected = (patch: Partial<ChartNote>) => {
    if (selected === null || !notes[selected]) return;
    const next = notes.map((note, index) => (index === selected ? { ...note, ...patch } : note));
    commit(next);
  };

  const removeSelected = () => {
    if (selected === null) return;
    commit(notes.filter((_, index) => index !== selected));
    setSelected(null);
  };

  const exportJson = () => {
    const cleanNotes = postProcessNotes(notes, chart.difficulty, audio.duration || Number.POSITIVE_INFINITY);
    const blob = new Blob([JSON.stringify({ ...chart, offset, notes: cleanNotes }, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${chart.difficulty}-edited.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!validateChart(value)) throw new Error("올바른 채보 JSON 형식이 아닙니다.");
      onChartChange(value);
      setNotes(value.notes);
      setOffset(value.offset);
      onMessage(`${file.name} 채보를 불러왔습니다.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "JSON 파일을 읽지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  };

  const selectedNote = selected === null ? null : notes[selected];

  return (
    <section className="editor-shell" aria-label="채보 에디터">
      <div className="editor-toolbar">
        <div>
          <span className="eyebrow">LIVE CHART LAB</span>
          <h2>채보 에디터</h2>
        </div>
        <div className="toolbar-actions">
          <button className="button button-primary" onClick={togglePlayback}>
            {playing ? "일시정지" : "재생"}
          </button>
          <label className="compact-field">
            속도
            <select
              value={playbackRate}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPlaybackRate(value);
                audio.element.playbackRate = value;
              }}
            >
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
            </select>
          </label>
          <button className={`button ${loop ? "is-active" : ""}`} onClick={() => setLoop((value) => !value)}>
            4초 반복 {loop ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="timeline-wrap">
        <canvas ref={canvasRef} onClick={handleCanvasClick} aria-label="클릭해서 노트를 추가하는 타임라인" />
        <div className="timeline-playhead" />
      </div>
      <div className="timeline-meta">
        <span>{formatTime(now)}</span>
        <input
          aria-label="에디터 타임라인"
          type="range"
          min={0}
          max={audio.duration || 1}
          step={0.01}
          value={Math.min(now, audio.duration || 1)}
          onChange={(event) => audio.seek(Number(event.target.value))}
        />
        <span>{formatTime(audio.duration)}</span>
      </div>

      <div className="editor-grid">
        <div className="editor-card">
          <span className="eyebrow">RECORD</span>
          <p>Z · X · C · V를 음악과 함께 눌러 기록하거나 타임라인을 클릭하세요.</p>
          <div className="lane-mini-grid">
            {LANE_LABELS.map((label, lane) => (
              <span key={label} style={{ "--lane-color": LANE_COLORS[lane] } as React.CSSProperties}>
                {label}
              </span>
            ))}
          </div>
          <p className="muted">현재 채보 {notes.length.toLocaleString()}개 노트</p>
        </div>

        <div className="editor-card">
          <span className="eyebrow">SELECTED NOTE</span>
          {selectedNote ? (
            <>
              <strong>{selectedNote.time.toFixed(3)}초 · {LANE_LABELS[selectedNote.lane]}</strong>
              <div className="nudge-row">
                <button onClick={() => updateSelected({ time: Math.max(0, selectedNote.time - 0.01) })}>−10ms</button>
                <button onClick={() => updateSelected({ time: selectedNote.time + 0.01 })}>+10ms</button>
                <button className="danger" onClick={removeSelected}>삭제</button>
              </div>
              <label className="compact-field">
                레인
                <select value={selectedNote.lane} onChange={(event) => updateSelected({ lane: Number(event.target.value) })}>
                  {LANE_LABELS.map((label, lane) => <option key={label} value={lane}>{label}</option>)}
                </select>
              </label>
            </>
          ) : <p className="muted">노트를 선택하면 미세 조정 도구가 표시됩니다.</p>}
        </div>

        <div className="editor-card">
          <span className="eyebrow">CHART FILE</span>
          <label className="compact-field">
            전체 오프셋
            <input
              type="number"
              step={0.01}
              value={offset}
              onChange={(event) => {
                const value = Number(event.target.value);
                setOffset(value);
                onChartChange({ ...chart, offset: value, notes });
              }}
            />
          </label>
          <div className="nudge-row">
            <button onClick={() => fileRef.current?.click()}>JSON 불러오기</button>
            <button onClick={exportJson}>JSON 내보내기</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
          </div>
        </div>
      </div>
    </section>
  );
}

function drawTimeline(
  canvas: HTMLCanvasElement,
  notes: ChartNote[],
  currentTime: number,
  selected: number | null,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const rowHeight = height / 4;
  context.font = "700 13px monospace";
  for (let lane = 0; lane < 4; lane += 1) {
    context.fillStyle = `${LANE_COLORS[lane]}0d`;
    context.fillRect(0, lane * rowHeight, width, rowHeight - 1);
    context.fillStyle = `${LANE_COLORS[lane]}aa`;
    context.fillText(LANE_LABELS[lane], 12, lane * rowHeight + 22);
  }
  for (let second = Math.ceil(currentTime - 4); second <= currentTime + 4; second += 1) {
    const x = width / 2 + ((second - currentTime) / 8) * width;
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  notes.forEach((note, index) => {
    if (note.time < currentTime - 4 || note.time > currentTime + 4) return;
    const x = width / 2 + ((note.time - currentTime) / 8) * width;
    const y = note.lane * rowHeight + rowHeight / 2;
    context.shadowColor = LANE_COLORS[note.lane];
    context.shadowBlur = index === selected ? 18 : 7;
    context.fillStyle = index === selected ? "#fff" : LANE_COLORS[note.lane];
    context.beginPath();
    context.arc(x, y, index === selected ? 8 : 5, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  });
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
