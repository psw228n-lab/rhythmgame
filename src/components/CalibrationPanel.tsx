"use client";

import { useEffect, useRef, useState } from "react";
import { LANE_CODES } from "../game/config";

interface Props {
  currentOffset: number;
  onApply: (offset: number) => void;
}

export default function CalibrationPanel({ currentOffset, onApply }: Props) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [beat, setBeat] = useState(0);
  const [measured, setMeasured] = useState(currentOffset);
  const expectedRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (status !== "running" || event.repeat || !LANE_CODES.includes(event.code as (typeof LANE_CODES)[number])) return;
      event.preventDefault();
      const now = performance.now();
      const closest = expectedRef.current.reduce(
        (best, expected) => Math.abs(expected - now) < Math.abs(best - now) ? expected : best,
        expectedRef.current[0] ?? now,
      );
      tapsRef.current.push(now - closest);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [status]);

  const start = async () => {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = contextRef.current ?? new AudioContextClass();
    contextRef.current = context;
    await context.resume();
    expectedRef.current = [];
    tapsRef.current = [];
    setStatus("running");
    setBeat(0);
    const interval = 600;
    const visualStart = performance.now() + 700;
    const audioStart = context.currentTime + 0.7;

    for (let index = 0; index < 8; index += 1) {
      const expected = visualStart + index * interval;
      expectedRef.current.push(expected);
      window.setTimeout(() => setBeat(index + 1), Math.max(0, expected - performance.now()));
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = index % 4 === 0 ? 880 : 620;
      gain.gain.setValueAtTime(0.0001, audioStart + index * interval / 1000);
      gain.gain.exponentialRampToValueAtTime(0.22, audioStart + index * interval / 1000 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioStart + index * interval / 1000 + 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(audioStart + index * interval / 1000);
      oscillator.stop(audioStart + index * interval / 1000 + 0.09);
    }

    window.setTimeout(() => {
      const taps = tapsRef.current.filter((value) => Math.abs(value) <= 300);
      const average = taps.length ? taps.reduce((sum, value) => sum + value, 0) / taps.length : currentOffset;
      setMeasured(Math.round(Math.max(-300, Math.min(300, average)) / 5) * 5);
      setStatus("done");
    }, 8 * interval + 900);
  };

  return (
    <section className="calibration-shell">
      <div className="calibration-copy">
        <span className="eyebrow">LATENCY TUNER</span>
        <h2>싱크 보정</h2>
        <p>8번의 테스트 비트에 맞춰 Z, X, C, V 중 편한 키를 누르세요. 평균 입력 지연을 5ms 단위로 계산합니다.</p>
        <div className="current-offset">
          <span>현재 오프셋</span>
          <strong>{currentOffset > 0 ? "+" : ""}{currentOffset}ms</strong>
        </div>
      </div>
      <div className={`beat-orbit ${status === "running" ? "is-running" : ""}`}>
        <div className="beat-core">{status === "running" ? beat : status === "done" ? `${measured}ms` : "READY"}</div>
        <span className="orbit orbit-one" />
        <span className="orbit orbit-two" />
      </div>
      <div className="calibration-actions">
        {status !== "running" && <button className="button button-primary" onClick={start}>{status === "done" ? "다시 측정" : "측정 시작"}</button>}
        {status === "done" && <button className="button" onClick={() => onApply(measured)}>측정값 적용</button>}
        {status === "running" && <p className="pulse-copy">비트를 듣고 키를 누르세요</p>}
      </div>
    </section>
  );
}
