"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioManager } from "../game/AudioManager";
import { DEFAULT_SETTINGS, LANE_COLORS, LANE_LABELS } from "../game/config";
import { GameEngine, type GameEvent } from "../game/GameEngine";
import { InputManager } from "../game/InputManager";
import { NoteManager, type HitEffect } from "../game/NoteManager";
import { removePostHoldLaneConflicts, validateChart } from "../game/chartUtils";
import type { Chart, Difficulty, GameSettings } from "../game/types";
import type { SongDefinition } from "../game/types";
import { rankingService } from "../services/rankingService";
import CalibrationPanel from "./CalibrationPanel";
import LeaderboardPanel from "./LeaderboardPanel";
import PlayerNameGate from "./PlayerNameGate";
import ScoreSubmission from "./ScoreSubmission";
import SongSelect from "./SongSelect";

type Mode = "songs" | "play" | "ranking" | "calibration";
type Phase = "idle" | "countdown" | "playing" | "paused" | "results";

export default function RhythmGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const engineRef = useRef(new GameEngine());
  const inputRef = useRef(new InputManager());
  const rendererRef = useRef(new NoteManager());
  const countdownTimerRef = useRef<number | null>(null);
  const latestEventRef = useRef<GameEvent | null>(null);
  const hitEffectsRef = useRef<HitEffect[]>([]);
  const fadeStartedRef = useRef(false);
  const finishStartedRef = useRef(false);

  const [mode, setMode] = useState<Mode>("songs");
  const [phase, setPhase] = useState<Phase>("idle");
  const [songs, setSongs] = useState<SongDefinition[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongDefinition | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [chart, setChart] = useState<Chart | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [message, setMessage] = useState("채보와 음악을 준비하고 있습니다.");
  const [judgement, setJudgement] = useState<GameEvent | null>(null);
  const [judgementDisplayId, setJudgementDisplayId] = useState(0);
  const [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(0);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  if (!audioRef.current && typeof window !== "undefined") audioRef.current = new AudioManager();
  const audio = audioRef.current;
  const engine = engineRef.current;

  useEffect(() => {
    setSettings(rankingService.getSettings(DEFAULT_SETTINGS));
    const savedPlayerName = rankingService.getPlayerName();
    setPlayerName(savedPlayerName);
    setPlayerReady(savedPlayerName.length >= 2);
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("./songs.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("곡 목록 파일을 찾지 못했습니다.");
        return response.json() as Promise<SongDefinition[]>;
      })
      .then((catalog) => {
        if (!cancelled) {
          setSongs(catalog);
          setSelectedSong((current) => current ?? catalog[0] ?? null);
          setMessage(catalog.length ? `${catalog.length}개의 곡을 불러왔습니다.` : "등록된 곡이 없습니다.");
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "곡 목록을 불러오지 못했습니다.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!audio || !selectedSong) return;
    let cancelled = false;
    const load = async () => {
      setLoaded(false);
      setPhase("idle");
      setMessage(`${difficulty.toUpperCase()} 채보를 불러오는 중입니다.`);
      try {
        const chartPath = selectedSong.charts[difficulty];
        const response = await fetch(chartPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`${selectedSong.title}의 ${difficulty} 채보가 없습니다.`);
        const data: unknown = await response.json();
        if (!validateChart(data)) throw new Error("채보 JSON 형식이 올바르지 않습니다.");
        await audio.load(resolveAssetPath(data.audio));
        if (cancelled) return;
        const gameEndTime = selectedSong.fadeOutAt + selectedSong.fadeOutDuration;
        const playableChart: Chart = {
          ...data,
          notes: removePostHoldLaneConflicts(
            data.notes.filter((note) =>
              note.time < gameEndTime - 0.08 &&
              (note.type !== "hold" || note.time + (note.duration ?? 0) < gameEndTime - 0.04)
            ),
          ),
        };
        audio.setVolume(settings.volume);
        engine.load(playableChart);
        setChart(playableChart);
        setLoaded(true);
        setMessage(`${Math.round(playableChart.bpm)} BPM · ${playableChart.notes.length.toLocaleString()} NOTES · 준비 완료`);
        setRevision((value) => value + 1);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "게임 데이터를 불러오지 못했습니다.");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [audio, difficulty, engine, selectedSong]);

  useEffect(() => {
    if (!audio) return;
    audio.setVolume(settings.volume);
    rankingService.saveSettings(settings);
  }, [audio, settings]);

  const showEvent = useCallback((event: GameEvent) => {
    latestEventRef.current = event;
    if (event.judgement !== "Bad") {
      const startedAtMs = performance.now();
      hitEffectsRef.current = [
        ...hitEffectsRef.current.filter((effect) => startedAtMs - effect.startedAtMs < 380),
        { lane: event.lane, judgement: event.judgement, startedAtMs },
      ].slice(-12);
    }
    setJudgement(event);
    setJudgementDisplayId((value) => value + 1);
    setRevision((value) => value + 1);
    window.setTimeout(() => {
      if (latestEventRef.current === event) setJudgement(null);
    }, 460);
  }, []);

  const finishGame = useCallback(() => {
    if (!audio || !chart || !selectedSong || finishStartedRef.current) return;
    finishStartedRef.current = true;
    audio.pause();
    audio.playCrowdCheer();
    const accuracy = engine.getAccuracy();
    const rank = engine.getRank();
    rankingService.saveLocalRecord(selectedSong.id, chart.difficulty, {
      score: engine.score.score,
      accuracy,
      maxCombo: engine.score.maxCombo,
      rank,
      playedAt: new Date().toISOString(),
    });
    setPhase("results");
    setRevision((value) => value + 1);
  }, [audio, chart, engine, selectedSong]);

  useEffect(() => {
    if (!audio) return;
    const onEnded = () => finishGame();
    audio.element.addEventListener("ended", onEnded);
    return () => audio.element.removeEventListener("ended", onEnded);
  }, [audio, finishGame]);

  useEffect(() => {
    if (!audio || mode !== "play") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const lane = inputRef.current.press(event.code, event.repeat);
      if (lane === null) return;
      event.preventDefault();
      if (phase === "playing") {
        audio.playHitSound();
        const gameTime = audio.currentTime + settings.audioOffset / 1000 + (chart?.offset ?? 0);
        const result = engine.press(lane, gameTime);
        if (result) showEvent(result);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const lane = inputRef.current.release(event.code);
      if (lane === null) return;
      event.preventDefault();
      if (phase === "playing") {
        const gameTime = audio.currentTime + settings.audioOffset / 1000 + (chart?.offset ?? 0);
        const result = engine.release(lane, gameTime);
        if (result) showEvent(result);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      inputRef.current.clear();
    };
  }, [audio, chart, engine, mode, phase, settings.audioOffset, showEvent]);

  useEffect(() => {
    if (!audio || mode !== "play") return;
    let frame = 0;
    let lastUiUpdate = 0;
    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      const gameTime = audio.currentTime + settings.audioOffset / 1000 + (chart?.offset ?? 0);
      if (phase === "playing") {
        const fadeOutAt = selectedSong?.fadeOutAt ?? audio.duration;
        const fadeOutDuration = selectedSong?.fadeOutDuration ?? 2.5;
        if (!fadeStartedRef.current && audio.currentTime >= fadeOutAt) {
          fadeStartedRef.current = true;
          audio.fadeOutMusic(fadeOutDuration);
        }
        if (audio.currentTime >= fadeOutAt + fadeOutDuration) {
          finishGame();
        } else {
          const events = engine.update(gameTime, inputRef.current.heldLanes);
          if (events.length) showEvent(events[events.length - 1]);
        }
      }
      if (canvas) {
        hitEffectsRef.current = hitEffectsRef.current.filter((effect) => timestamp - effect.startedAtMs < 380);
        rendererRef.current.render(canvas, {
          audioTime: gameTime,
          frameTimeMs: timestamp,
          noteSpeed: settings.noteSpeed,
          notes: engine.notes,
          pressedLanes: inputRef.current.heldLanes,
          combo: engine.score.combo,
          hitEffects: hitEffectsRef.current,
        });
      }
      if (timestamp - lastUiUpdate > 80) {
        setClock(audio.currentTime);
        setRevision((value) => value + 1);
        lastUiUpdate = timestamp;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [audio, chart, engine, finishGame, mode, phase, selectedSong, settings.audioOffset, settings.noteSpeed, showEvent]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && phase === "playing" && audio) {
        audio.pause();
        setPhase("paused");
        setMessage("탭이 비활성화되어 자동으로 일시정지했습니다.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [audio, phase]);

  useEffect(() => () => {
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
  }, []);

  const startGame = async () => {
    if (!audio || !chart) return;
    if (!loaded) {
      setMessage("음악 로딩이 끝날 때까지 잠시 기다려 주세요.");
      return;
    }
    try {
      await audio.unlock();
      audio.pause();
      audio.resetMusicFade();
      audio.seek(0);
      engine.load(chart);
      inputRef.current.clear();
      hitEffectsRef.current = [];
      fadeStartedRef.current = false;
      finishStartedRef.current = false;
      setCountdown(3);
      setPhase("countdown");
      setJudgement(null);
      let value = 3;
      countdownTimerRef.current = window.setInterval(async () => {
        value -= 1;
        setCountdown(value);
        if (value <= 0) {
          if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
          try {
            await audio.play();
            setPhase("playing");
          } catch {
            setPhase("idle");
            setMessage("브라우저가 오디오 재생을 막았습니다. 시작 버튼을 다시 눌러 주세요.");
          }
        }
      }, 1000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게임을 시작할 수 없습니다.");
    }
  };

  const togglePause = async () => {
    if (!audio || !loaded) return;
    if (phase === "playing") {
      audio.pause();
      setPhase("paused");
    } else if (phase === "paused") {
      try {
        await audio.play();
        setPhase("playing");
      } catch {
        setMessage("오디오를 다시 재생하지 못했습니다.");
      }
    }
  };

  const changeMode = (nextMode: Mode) => {
    audio?.pause();
    audio?.resetMusicFade();
    inputRef.current.clear();
    setPhase("idle");
    setMode(nextMode);
  };

  const selectSong = (song: SongDefinition) => {
    audio?.pause();
    audio?.resetMusicFade();
    inputRef.current.clear();
    setSelectedSong(song);
    setDifficulty("normal");
    setPhase("idle");
    setMode("play");
  };

  const score = engine.score;
  const accuracy = engine.getAccuracy();
  const best = useMemo(
    () => typeof window === "undefined" || !selectedSong ? undefined : rankingService.getLocalRecord(selectedSong.id, difficulty),
    [difficulty, revision, selectedSong],
  );
  const gameEndTime = selectedSong
    ? selectedSong.fadeOutAt + selectedSong.fadeOutDuration
    : audio?.duration ?? 0;
  const progress = gameEndTime ? (clock / gameEndTime) * 100 : 0;

  return (
    <main className="app-shell" data-testid="rhythm-game">
      <div className="noise-layer" aria-hidden="true" />
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Afterglow 홈">
          <span className="brand-mark">A</span>
          <span><strong>AFTERGLOW</strong><small>NEURAL RHYTHM SYSTEM</small></span>
        </a>
        <nav className="mode-switch" aria-label="화면 선택">
          <button className={mode === "songs" ? "active" : ""} onClick={() => changeMode("songs")}>SONG SELECT</button>
          <button className={mode === "play" ? "active" : ""} onClick={() => changeMode("play")}>PLAY</button>
          <button className={mode === "ranking" ? "active" : ""} onClick={() => changeMode("ranking")}>RANKING</button>
          <button className={mode === "calibration" ? "active" : ""} onClick={() => changeMode("calibration")}>SYNC</button>
        </nav>
        <div className="topbar-profile">
          <button className="player-badge" type="button" disabled={phase === "playing" || phase === "countdown"} onClick={() => setPlayerReady(false)} aria-label="플레이어 이름 변경">
            <span>PLAYER</span>
            <strong>{playerName || "SET NAME"}</strong>
          </button>
          <div className={`system-status ${loaded ? "online" : ""}`}>
            <span /> {loaded ? "SYSTEM READY" : "LOADING"}
          </div>
        </div>
      </header>

      {mode === "songs" && <SongSelect songs={songs} selectedId={selectedSong?.id ?? null} onSelect={selectSong} />}

      {mode === "play" && (
        <div className="game-layout" id="top">
          <aside className="hud-column hud-left">
            <div className="song-meta">
              <span className="eyebrow">NOW PLAYING / {Math.max(1, songs.findIndex((song) => song.id === selectedSong?.id) + 1).toString().padStart(2, "0")}</span>
              <h1>{selectedSong?.title ?? "Select a track"}</h1>
              <p>{selectedSong?.artist ?? "MUSIC ARCHIVE"}</p>
            </div>
            <div className="metric-stack">
              <HudMetric label="SCORE" value={score.score.toLocaleString().padStart(7, "0")} accent />
              <HudMetric label="COMBO" value={score.combo.toString().padStart(3, "0")} />
              <HudMetric label="MAX COMBO" value={Math.max(score.maxCombo, best?.maxCombo ?? 0).toString().padStart(3, "0")} />
              <HudMetric label="ACCURACY" value={`${accuracy.toFixed(2)}%`} />
            </div>
            <div className="distribution-card">
              {(["Perfect", "Great", "Good", "Bad"] as const).map((key) => (
                <div key={key}><span>{key.toUpperCase()}</span><strong>{score.counts[key].toString().padStart(3, "0")}</strong></div>
              ))}
            </div>
          </aside>

          <section className="playfield-panel">
            <div className="stage-index"><span>STAGE 01</span><strong>{difficulty.toUpperCase()}</strong></div>
            <canvas ref={canvasRef} className="game-canvas" aria-label="4레인 리듬게임 플레이 화면" />
            <div className={`judgement-pop ${judgement ? judgement.judgement.toLowerCase() : ""}`} aria-live="polite">
              {judgement && (
                <div className="judgement-pop-content" key={judgementDisplayId}>
                  <strong>{judgement.judgement}</strong>
                  <span>{judgement.deltaMs > 0 ? "+" : ""}{Math.round(judgement.deltaMs)}ms</span>
                </div>
              )}
            </div>
            {phase === "countdown" && (
              <div className="countdown" aria-live="assertive">
                <span>GET READY</span>
                <strong>{countdown || "GO"}</strong>
                <div className="lane-key-guide" aria-hidden="true">
                  {LANE_LABELS.map((key, lane) => (
                    <div className="lane-key-guide-cell" key={key}>
                      <kbd
                        style={{
                          "--lane-color": LANE_COLORS[lane],
                          "--lane-guide-delay": `${lane * 90}ms`,
                        } as React.CSSProperties}
                      >
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {phase === "idle" && <div className="idle-prompt"><span>PRESS START TO CONNECT</span><div className="key-row">{LANE_LABELS.map((key, lane) => <kbd key={key} style={{ "--lane-color": LANE_COLORS[lane] } as React.CSSProperties}>{key}</kbd>)}</div></div>}
            {phase === "paused" && <div className="pause-overlay"><span>PLAYBACK SUSPENDED</span><strong>PAUSED</strong></div>}
          </section>

          <aside className="hud-column hud-right">
            <div className="control-heading"><span className="eyebrow">LIVE CONTROL</span><h2>Game setup</h2></div>
            <label className="control-field">
              <span><b>DIFFICULTY</b><em>{difficulty.toUpperCase()}</em></span>
              <select value={difficulty} disabled={phase === "playing" || phase === "countdown"} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                <option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option>
              </select>
            </label>
            <RangeControl label="NOTE SPEED" value={settings.noteSpeed} min={0.65} max={1.8} step={0.05} suffix="×" onChange={(noteSpeed) => setSettings((value) => ({ ...value, noteSpeed }))} />
            <RangeControl label="VOLUME" value={settings.volume} min={0} max={1} step={0.01} display={`${Math.round(settings.volume * 100)}%`} onChange={(volume) => setSettings((value) => ({ ...value, volume }))} />
            <RangeControl label="SYNC OFFSET" value={settings.audioOffset} min={-300} max={300} step={5} suffix="ms" display={`${settings.audioOffset > 0 ? "+" : ""}${settings.audioOffset}ms`} onChange={(audioOffset) => setSettings((value) => ({ ...value, audioOffset }))} />

            <div className="primary-actions">
              <button className="button button-primary" onClick={startGame} disabled={!loaded || phase === "countdown"}>{phase === "results" ? "RETRY RUN" : "START RUN"}</button>
              <button className="button" onClick={togglePause} disabled={!(["playing", "paused"] as Phase[]).includes(phase)}>{phase === "paused" ? "RESUME" : "PAUSE"}</button>
              <button className="icon-button" aria-label="재시작" onClick={startGame} disabled={!loaded}>↻</button>
            </div>
            <div className="status-message" role="status"><span />{message}</div>
          </aside>

          <footer className="transport-bar">
            <span>{formatTime(clock)}</span>
            <div className="progress-track"><i style={{ width: `${Math.min(100, progress)}%` }} /></div>
            <span>{formatTime(gameEndTime)}</span>
            <div className="bpm-chip"><b>{chart ? Math.round(chart.bpm) : "---"}</b><small>BPM</small></div>
          </footer>
        </div>
      )}

      {mode === "ranking" && <LeaderboardPanel songs={songs} initialSongId={selectedSong?.id} refreshKey={leaderboardRefresh} />}
      {mode === "calibration" && <CalibrationPanel currentOffset={settings.audioOffset} onApply={(audioOffset) => { setSettings((value) => ({ ...value, audioOffset })); setMessage(`싱크 오프셋을 ${audioOffset}ms로 저장했습니다.`); changeMode("play"); }} />}

      {phase === "results" && (
        <div className="result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <section className="result-card">
            <span className="eyebrow">RUN COMPLETE</span>
            <div className="rank-orb">{engine.getRank()}</div>
            <h2 id="result-title">Signal synchronized</h2>
            <p>{difficulty.toUpperCase()} · {chart?.notes.length.toLocaleString()} NOTES</p>
            <div className="result-score"><small>FINAL SCORE</small><strong>{score.score.toLocaleString()}</strong></div>
            <div className="result-grid">
              <ResultMetric label="ACCURACY" value={`${accuracy.toFixed(2)}%`} />
              <ResultMetric label="MAX COMBO" value={score.maxCombo.toString()} />
              <ResultMetric label="PERFECT" value={score.counts.Perfect.toString()} />
              <ResultMetric label="GREAT" value={score.counts.Great.toString()} />
              <ResultMetric label="GOOD" value={score.counts.Good.toString()} />
              <ResultMetric label="BAD" value={score.counts.Bad.toString()} />
            </div>
            {selectedSong && <ScoreSubmission score={{ songId: selectedSong.id, difficulty, score: score.score, accuracy, maxCombo: score.maxCombo, counts: score.counts }} onSubmitted={() => setLeaderboardRefresh((value) => value + 1)} />}
            <div className="result-actions"><button className="button button-primary" onClick={startGame}>PLAY AGAIN</button><button className="button" onClick={() => setPhase("idle")}>CLOSE</button></div>
          </section>
        </div>
      )}

      <div className="mobile-guard"><strong>DESKTOP LINK REQUIRED</strong><p>정확한 키 입력과 4레인 플레이를 위해 데스크톱 브라우저에서 열어 주세요.</p></div>
      {profileLoaded && !playerReady && (
        <PlayerNameGate
          initialName={playerName}
          onSaved={(name) => {
            setPlayerName(name);
            setPlayerReady(true);
          }}
        />
      )}
    </main>
  );
}

function HudMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`hud-metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function RangeControl({ label, value, min, max, step, suffix = "", display, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; display?: string; onChange: (value: number) => void }) {
  return (
    <label className="control-field">
      <span><b>{label}</b><em>{display ?? `${value.toFixed(2)}${suffix}`}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function resolveAssetPath(path: string) {
  const clean = path.replace(/^\/+/, "");
  return new URL(`./${clean}`, window.location.href).toString();
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}
