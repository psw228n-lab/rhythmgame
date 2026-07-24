import { JUDGEMENT_WINDOWS } from "./config";
import { applyJudgement, calculateAccuracy, calculateRank, createScoreState, judgeTiming } from "./JudgeManager";
import type { Chart, ChartNote, Judgement, ScoreState } from "./types";

export interface RuntimeNote extends ChartNote {
  id: number;
  status: "pending" | "holding" | "hit" | "miss";
  pendingJudgement?: Judgement;
}

export interface GameEvent {
  judgement: Judgement;
  deltaMs: number;
  lane: number;
  displayJudgement?: boolean;
  matchedNote?: boolean;
}

export class GameEngine {
  notes: RuntimeNote[] = [];
  score: ScoreState = createScoreState();
  private nextMissIndex = 0;

  load(chart: Chart) {
    this.notes = chart.notes.map((note, id) => ({ ...note, id, status: "pending" }));
    this.score = createScoreState();
    this.nextMissIndex = 0;
  }

  press(lane: number, audioTime: number): GameEvent | null {
    let candidate: RuntimeNote | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = this.nextMissIndex; index < this.notes.length; index += 1) {
      const note = this.notes[index];
      if (note.time > audioTime + JUDGEMENT_WINDOWS.Bad / 1000) break;
      if (note.status !== "pending" || note.lane !== lane) continue;
      const distance = Math.abs(note.time - audioTime);
      if (distance > JUDGEMENT_WINDOWS.Bad / 1000) continue;
      if (distance < bestDistance) {
        candidate = note;
        bestDistance = distance;
      }
    }
    if (!candidate) return this.applyStrayPress(lane);

    const deltaMs = (audioTime - candidate.time) * 1000;
    const judgement = judgeTiming(deltaMs);

    if (candidate.type === "hold") {
      candidate.status = "holding";
      candidate.pendingJudgement = judgement;
      return { judgement, deltaMs, lane, displayJudgement: false, matchedNote: true };
    }
    candidate.status = "hit";
    this.score = applyJudgement(this.score, judgement);
    this.advanceMissCursor();
    return { judgement, deltaMs, lane, matchedNote: true };
  }

  release(lane: number, audioTime: number): GameEvent | null {
    const note = this.notes.find((item) => item.status === "holding" && item.lane === lane);
    if (!note) return null;
    const endTime = note.time + (note.duration ?? 0);
    const heldLongEnough = audioTime >= endTime - JUDGEMENT_WINDOWS.Bad / 1000;
    const judgement = heldLongEnough ? note.pendingJudgement ?? "Good" : "Bad";
    note.status = heldLongEnough ? "hit" : "miss";
    this.score = applyJudgement(this.score, judgement);
    this.advanceMissCursor();
    return { judgement, deltaMs: (audioTime - endTime) * 1000, lane };
  }

  update(audioTime: number, heldLanes: Set<number>): GameEvent[] {
    const events: GameEvent[] = [];
    for (let index = this.nextMissIndex; index < this.notes.length; index += 1) {
      const note = this.notes[index];
      if (note.status === "holding") {
        const endTime = note.time + (note.duration ?? 0);
        if (audioTime >= endTime) {
          const completed = heldLanes.has(note.lane);
          note.status = completed ? "hit" : "miss";
          const judgement = completed ? note.pendingJudgement ?? "Good" : "Bad";
          this.score = applyJudgement(this.score, judgement);
          events.push({ judgement, deltaMs: (audioTime - endTime) * 1000, lane: note.lane });
        }
        continue;
      }
      if (note.status !== "pending") continue;
      if (audioTime <= note.time + JUDGEMENT_WINDOWS.Bad / 1000) break;
      note.status = "miss";
      this.score = applyJudgement(this.score, "Bad");
      events.push({ judgement: "Bad", deltaMs: (audioTime - note.time) * 1000, lane: note.lane });
    }
    this.advanceMissCursor();
    return events;
  }

  getAccuracy() {
    return calculateAccuracy(this.score);
  }

  getRank() {
    return calculateRank(this.getAccuracy());
  }

  private advanceMissCursor() {
    while (
      this.nextMissIndex < this.notes.length &&
      ["hit", "miss"].includes(this.notes[this.nextMissIndex].status)
    ) {
      this.nextMissIndex += 1;
    }
  }

  private applyStrayPress(lane: number): GameEvent {
    this.score = applyJudgement(this.score, "Bad");
    return { judgement: "Bad", deltaMs: 0, lane };
  }
}
