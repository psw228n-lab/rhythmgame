import { analysisConfig, difficultyConfig } from "./chart-config.mjs";

export function analyzePcm(channelData, sampleRate) {
  const channels = channelData.length;
  const sampleCount = channelData[0]?.length ?? 0;
  if (!sampleCount || !sampleRate) throw new Error("디코딩된 PCM 데이터가 비어 있습니다.");
  const { frameSize, hopSize } = analysisConfig;
  const frameCount = Math.max(1, Math.floor((sampleCount - frameSize) / hopSize));
  const energy = new Float32Array(frameCount);
  const percussion = new Float32Array(frameCount);
  let maxEnergy = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sumSquares = 0;
    let sumDifference = 0;
    let previous = 0;
    for (let index = start; index < start + frameSize; index += 2) {
      let sample = 0;
      for (let channel = 0; channel < channels; channel += 1) sample += channelData[channel][index] ?? 0;
      sample /= channels;
      sumSquares += sample * sample;
      sumDifference += Math.abs(sample - previous);
      previous = sample;
    }
    const points = frameSize / 2;
    energy[frame] = Math.log1p(Math.sqrt(sumSquares / points) * 18);
    percussion[frame] = Math.log1p((sumDifference / points) * 28);
    maxEnergy = Math.max(maxEnergy, energy[frame]);
  }

  const novelty = new Float32Array(frameCount);
  for (let index = 1; index < frameCount; index += 1) {
    novelty[index] = Math.max(0, energy[index] - energy[index - 1]) +
      0.52 * Math.max(0, percussion[index] - percussion[index - 1]);
  }

  const onsets = [];
  const localWindow = 42;
  let lastOnset = -10;
  for (let index = localWindow; index < frameCount - 2; index += 1) {
    let sum = 0;
    let squared = 0;
    for (let cursor = index - localWindow; cursor < index; cursor += 1) {
      sum += novelty[cursor];
      squared += novelty[cursor] * novelty[cursor];
    }
    const mean = sum / localWindow;
    const deviation = Math.sqrt(Math.max(0, squared / localWindow - mean * mean));
    const threshold = mean + deviation * analysisConfig.onsetThreshold;
    const time = (index * hopSize) / sampleRate;
    if (
      novelty[index] > threshold &&
      novelty[index] >= novelty[index - 1] &&
      novelty[index] >= novelty[index + 1] &&
      time - lastOnset >= analysisConfig.minOnsetGap
    ) {
      onsets.push({ time, strength: novelty[index], energy: energy[index] });
      lastOnset = time;
    }
  }

  const firstFrame = energy.findIndex((value) => value >= maxEnergy * analysisConfig.silenceRatio);
  const firstSound = Math.max(0, (firstFrame * hopSize) / sampleRate);
  const duration = sampleCount / sampleRate;
  const bpm = estimateBpm(onsets);
  const phase = estimateBeatPhase(onsets, bpm);
  const energyValues = Array.from(energy);
  const sortedEnergy = [...energyValues].sort((a, b) => a - b);
  const highEnergy = sortedEnergy[Math.floor(sortedEnergy.length * 0.78)] || maxEnergy;

  return {
    bpm,
    phase,
    duration,
    firstSound,
    onsets,
    energy: energyValues,
    hopSeconds: hopSize / sampleRate,
    maxEnergy,
    highEnergy,
  };
}

export function estimateBpm(onsets) {
  if (onsets.length < 4) return 120;
  const min = analysisConfig.bpmMin;
  const max = analysisConfig.bpmMax;
  const histogram = new Float64Array((max - min) * 2 + 1);
  for (let index = 0; index < onsets.length; index += 1) {
    for (let next = index + 1; next < Math.min(onsets.length, index + 10); next += 1) {
      const interval = onsets[next].time - onsets[index].time;
      if (interval < 0.24 || interval > 2.2) continue;
      let bpm = 60 / interval;
      while (bpm < min) bpm *= 2;
      while (bpm > max) bpm /= 2;
      const bin = Math.round((bpm - min) * 2);
      const weight = Math.sqrt(onsets[index].strength * onsets[next].strength) / Math.sqrt(next - index);
      for (let spread = -2; spread <= 2; spread += 1) {
        if (histogram[bin + spread] !== undefined) histogram[bin + spread] += weight * (1 - Math.abs(spread) * 0.18);
      }
    }
  }
  let best = 0;
  for (let index = 1; index < histogram.length - 1; index += 1) {
    if (histogram[index] > histogram[best]) best = index;
  }
  const coarseBpm = min + best / 2;
  return refineBpmToBeatGrid(onsets, coarseBpm);
}

export function estimateBeatPhase(onsets, bpm) {
  const beat = 60 / bpm;
  const bins = 96;
  const scores = new Float64Array(bins);
  for (const onset of onsets) {
    const normalized = ((onset.time % beat) + beat) % beat;
    const bin = Math.round((normalized / beat) * (bins - 1));
    scores[bin] += onset.strength;
  }
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) if (scores[index] > scores[best]) best = index;
  return (best / (bins - 1)) * beat;
}

export function refineBpmToBeatGrid(onsets, coarseBpm) {
  const searchStart = Math.max(analysisConfig.bpmMin, coarseBpm - 8);
  const searchEnd = Math.min(analysisConfig.bpmMax, coarseBpm + 8);
  let bestBpm = coarseBpm;
  let bestScore = -Infinity;

  for (let bpm = searchStart; bpm <= searchEnd + 0.001; bpm += 0.25) {
    const candidate = Number(bpm.toFixed(2));
    const phase = estimateBeatPhase(onsets, candidate);
    const score = beatGridAlignmentScore(onsets, candidate, phase);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = candidate;
    }
  }

  return Number(bestBpm.toFixed(2));
}

function beatGridAlignmentScore(onsets, bpm, phase) {
  const sixteenth = 60 / bpm / 4;
  const tolerance = sixteenth * 0.14;
  let alignedStrength = 0;
  let totalStrength = 0;

  for (const onset of onsets) {
    const gridPosition = (onset.time - phase) / sixteenth;
    const distance = Math.abs(gridPosition - Math.round(gridPosition)) * sixteenth;
    const weight = Math.max(0, onset.strength);
    alignedStrength += weight * Math.exp(-0.5 * (distance / tolerance) ** 2);
    totalStrength += weight;
  }

  return totalStrength ? alignedStrength / totalStrength : 0;
}

export function createDifficultyNotes(analysis, difficulty) {
  const config = difficultyConfig[difficulty];
  const beat = 60 / analysis.bpm;
  const step = beat / config.subdivision;
  const start = Math.max(1.75, analysis.firstSound + 0.55);
  const firstGrid = analysis.phase + Math.ceil((start - analysis.phase) / step) * step;
  const candidates = [];
  const patterns = [
    [0, 1, 2, 3, 1, 2, 0, 3],
    [3, 2, 1, 0, 2, 1, 3, 0],
    [1, 2, 1, 2, 0, 2, 3, 1],
    [0, 2, 1, 3, 2, 0, 3, 1],
  ];
  let slot = 0;

  for (let time = firstGrid; time < analysis.duration - 0.35; time += step, slot += 1) {
    const energy = energyAt(analysis, time);
    const normalizedEnergy = analysis.maxEnergy ? energy / analysis.maxEnergy : 0;
    const onset = nearestOnset(analysis.onsets, time, step * 0.48);
    const isMainBeat = slot % config.subdivision === 0;
    const isHalfBeat = slot % Math.max(1, config.subdivision / 2) === 0;
    const bar = Math.floor(slot / (config.subdivision * 4));
    const localSlot = slot % (config.subdivision * 4);
    const deterministicPulse = (Math.sin(slot * 12.9898 + bar * 3.31) + 1) / 2;

    let include = false;
    if (difficulty === "easy") include = isMainBeat && (normalizedEnergy > 0.12 || bar % 2 === 0);
    if (difficulty === "normal") include = isMainBeat || (isHalfBeat && (onset?.strength ?? 0) > config.detailThreshold * 0.12) || (normalizedEnergy > 0.68 && deterministicPulse > 0.55);
    if (difficulty === "hard") include = isHalfBeat || Boolean(onset) || (normalizedEnergy > 0.58 && deterministicPulse > config.detailThreshold);
    if (!include) continue;

    const pattern = patterns[bar % patterns.length];
    const lane = pattern[(localSlot + Math.floor(bar / 4)) % pattern.length];
    const quiet = normalizedEnergy < 0.14;
    if (quiet && !isMainBeat) continue;

    const holdCycle = difficulty === "easy" ? 4 : difficulty === "normal" ? 4 : 5;
    const holdBeats = difficulty === "easy" ? 1.5 : difficulty === "normal" ? 1.25 : 1;
    const shouldHold = localSlot === 0 && bar % holdCycle === holdCycle - 1 && normalizedEnergy >= 0.1;
    candidates.push({
      time: Number(time.toFixed(4)),
      lane,
      type: shouldHold ? "hold" : "tap",
      ...(shouldHold ? { duration: Number((beat * holdBeats).toFixed(3)) } : {}),
    });

    const climax = energy >= analysis.highEnergy;
    const chordCycle = difficulty === "hard" ? 8 : 16;
    if (difficulty !== "easy" && climax && isMainBeat && bar % 2 === 1 && slot % chordCycle === 0) {
      candidates.push({ time: Number(time.toFixed(4)), lane: 3 - lane, type: "tap" });
    }
  }

  return sanitizeGeneratedNotes(candidates, difficulty, analysis.duration);
}

export function sanitizeGeneratedNotes(notes, difficulty, duration) {
  const { minGap, maxNps } = difficultyConfig[difficulty];
  const sorted = notes
    .filter((note) => Number.isFinite(note.time) && note.time >= 1.5 && note.time < duration - 0.12 && Number.isInteger(note.lane) && note.lane >= 0 && note.lane <= 3)
    .sort((a, b) => a.time - b.time || a.lane - b.lane);
  const output = [];
  const recent = [];
  let previousLane = -1;
  let laneRun = 0;

  for (const source of sorted) {
    const note = { ...source };
    if (output.some((item) => item.lane === note.lane && Math.abs(item.time - note.time) < 0.03)) continue;
    const simultaneous = output.filter((item) => Math.abs(item.time - note.time) < 0.015);
    if (simultaneous.length >= 2) continue;
    const priorTime = [...output].reverse().find((item) => Math.abs(item.time - note.time) >= 0.015)?.time;
    if (priorTime !== undefined && note.time - priorTime < minGap) continue;
    while (recent.length && note.time - recent[0] > 1) recent.shift();
    if (recent.length >= Math.floor(maxNps)) continue;
    laneRun = note.lane === previousLane ? laneRun + 1 : 1;
    if (laneRun > 3) {
      note.lane = (note.lane + 1 + output.length % 2) % 4;
      laneRun = 1;
    }
    if (
      output.some((item) =>
        item.type === "hold" &&
        item.lane === note.lane &&
        item.time + (item.duration ?? 0) + 0.32 > note.time
      )
    ) continue;
    if (note.type === "hold") note.duration = Number(Math.max(0.28, Math.min(note.duration ?? 0.5, duration - note.time - 0.1)).toFixed(3));
    output.push(note);
    recent.push(note.time);
    previousLane = note.lane;
  }
  return output;
}

function energyAt(analysis, time) {
  const index = Math.max(0, Math.min(analysis.energy.length - 1, Math.floor(time / analysis.hopSeconds)));
  return analysis.energy[index] ?? 0;
}

function nearestOnset(onsets, time, tolerance) {
  let best = null;
  for (const onset of onsets) {
    if (onset.time < time - tolerance) continue;
    if (onset.time > time + tolerance) break;
    if (!best || Math.abs(onset.time - time) < Math.abs(best.time - time)) best = onset;
  }
  return best;
}
