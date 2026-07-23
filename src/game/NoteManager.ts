import { LANE_COLORS, LANE_LABELS } from "./config";
import type { RuntimeNote } from "./GameEngine";
import type { Judgement } from "./types";

export interface HitEffect {
  lane: number;
  judgement: Judgement;
  startedAtMs: number;
}

interface RenderOptions {
  audioTime: number;
  frameTimeMs: number;
  noteSpeed: number;
  notes: RuntimeNote[];
  pressedLanes: Set<number>;
  combo: number;
  hitEffects: HitEffect[];
}

export class NoteManager {
  render(canvas: HTMLCanvasElement, options: RenderOptions) {
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

    const laneWidth = width / 4;
    const judgeY = height - 86;
    const judgeHeight = 40;
    const travelTime = 2.25 / options.noteSpeed;
    const pixelsPerSecond = judgeY / travelTime;
    const glow = Math.min(26, 8 + options.combo / 12);

    for (let lane = 0; lane < 4; lane += 1) {
      const x = lane * laneWidth;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, `${LANE_COLORS[lane]}05`);
      gradient.addColorStop(1, options.pressedLanes.has(lane) ? `${LANE_COLORS[lane]}32` : `${LANE_COLORS[lane]}10`);
      context.fillStyle = gradient;
      context.fillRect(x + 1, 0, laneWidth - 2, height);
      context.strokeStyle = `${LANE_COLORS[lane]}25`;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let lane = 0; lane < 4; lane += 1) {
      const x = lane * laneWidth;
      context.save();
      context.shadowBlur = options.pressedLanes.has(lane) ? glow + 8 : glow;
      context.shadowColor = LANE_COLORS[lane];
      context.fillStyle = options.pressedLanes.has(lane) ? `${LANE_COLORS[lane]}38` : "rgba(247,250,255,.055)";
      context.strokeStyle = options.pressedLanes.has(lane) ? LANE_COLORS[lane] : `${LANE_COLORS[lane]}78`;
      context.lineWidth = options.pressedLanes.has(lane) ? 3 : 1.5;
      context.beginPath();
      context.roundRect(x + 7, judgeY - judgeHeight / 2, laneWidth - 14, judgeHeight, 9);
      context.fill();
      context.stroke();
      context.restore();
    }
    context.save();
    context.shadowBlur = glow;
    context.shadowColor = "#f5f7ff";
    context.fillStyle = "rgba(247,250,255,.92)";
    context.fillRect(0, judgeY - 1, width, 3);
    context.restore();

    const visibleStart = options.audioTime - 0.22;
    const visibleEnd = options.audioTime + travelTime + 0.25;
    for (const note of options.notes) {
      if (note.status === "hit" || note.status === "miss") continue;
      const end = note.time + (note.duration ?? 0);
      if (end < visibleStart || note.time > visibleEnd) continue;
      const centerX = note.lane * laneWidth + laneWidth / 2;
      const y = judgeY - (note.time - options.audioTime) * pixelsPerSecond;
      const noteWidth = laneWidth * 0.7;
      const noteHeight = 30;

      context.save();
      context.shadowColor = LANE_COLORS[note.lane];
      context.shadowBlur = note.status === "holding" ? 28 : 14;
      if (note.type === "hold") {
        const tailY = judgeY - (end - options.audioTime) * pixelsPerSecond;
        const top = Math.min(y, tailY);
        const bodyHeight = Math.max(10, Math.abs(tailY - y));
        const bodyGradient = context.createLinearGradient(0, top, 0, top + bodyHeight);
        bodyGradient.addColorStop(0, `${LANE_COLORS[note.lane]}55`);
        bodyGradient.addColorStop(1, `${LANE_COLORS[note.lane]}cc`);
        context.fillStyle = bodyGradient;
        context.fillRect(centerX - noteWidth * 0.32, top, noteWidth * 0.64, bodyHeight);
      }
      context.fillStyle = LANE_COLORS[note.lane];
      context.beginPath();
      context.roundRect(centerX - noteWidth / 2, y - noteHeight / 2, noteWidth, noteHeight, 6);
      context.fill();
      context.fillStyle = "rgba(255,255,255,.8)";
      context.fillRect(centerX - noteWidth * 0.34, y - 2, noteWidth * 0.68, 3);
      context.restore();
    }

    for (const effect of options.hitEffects) {
      this.renderHitEffect(context, laneWidth, judgeY, judgeHeight, effect, options.frameTimeMs);
    }

    context.font = "700 15px var(--font-mono, monospace)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let lane = 0; lane < 4; lane += 1) {
      const x = lane * laneWidth + laneWidth / 2;
      context.fillStyle = options.pressedLanes.has(lane) ? "#fff" : "rgba(255,255,255,.52)";
      context.fillText(LANE_LABELS[lane], x, height - 42);
    }
  }

  private renderHitEffect(
    context: CanvasRenderingContext2D,
    laneWidth: number,
    judgeY: number,
    judgeHeight: number,
    effect: HitEffect,
    frameTimeMs: number,
  ) {
    const elapsed = frameTimeMs - effect.startedAtMs;
    if (elapsed < 0 || elapsed > 380 || effect.judgement === "Bad") return;
    const progress = elapsed / 380;
    const eased = 1 - (1 - progress) ** 3;
    const color = LANE_COLORS[effect.lane];
    const x = effect.lane * laneWidth + laneWidth / 2;
    const strength = effect.judgement === "Perfect" ? 1 : effect.judgement === "Great" ? 0.82 : 0.66;

    context.save();
    context.translate(x, judgeY);
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = (1 - progress) * strength;
    context.shadowColor = color;
    context.shadowBlur = 28 * (1 - progress);

    context.fillStyle = color;
    context.beginPath();
    context.roundRect(-laneWidth * 0.38, -judgeHeight * 0.62, laneWidth * 0.76, judgeHeight * 1.24, 12);
    context.fill();

    context.lineWidth = 5 - progress * 3;
    context.strokeStyle = "#ffffff";
    context.beginPath();
    context.arc(0, 0, 13 + eased * laneWidth * 0.43, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = color;
    context.lineWidth = 3;
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      const innerRadius = 18 + eased * 16;
      const outerRadius = innerRadius + 14 + eased * 28;
      context.beginPath();
      context.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
      context.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
      context.stroke();
    }

    context.fillStyle = "#ffffff";
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + effect.lane * 0.22;
      const radius = 16 + eased * (34 + (index % 3) * 8);
      const size = 4 * (1 - progress) + 1;
      context.fillRect(Math.cos(angle) * radius - size / 2, Math.sin(angle) * radius - size / 2, size, size);
    }
    context.restore();
  }
}
