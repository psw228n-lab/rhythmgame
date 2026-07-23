import { LANE_COLORS, LANE_LABELS } from "./config";
import type { RuntimeNote } from "./GameEngine";

interface RenderOptions {
  audioTime: number;
  noteSpeed: number;
  notes: RuntimeNote[];
  pressedLanes: Set<number>;
  combo: number;
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

    context.save();
    context.shadowBlur = glow;
    context.shadowColor = "#f5f7ff";
    context.fillStyle = "rgba(247,250,255,.95)";
    context.fillRect(0, judgeY, width, 2);
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
      const noteHeight = 16;

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

    context.font = "700 15px var(--font-mono, monospace)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let lane = 0; lane < 4; lane += 1) {
      const x = lane * laneWidth + laneWidth / 2;
      context.fillStyle = options.pressedLanes.has(lane) ? "#fff" : "rgba(255,255,255,.52)";
      context.fillText(LANE_LABELS[lane], x, height - 42);
    }
  }
}
