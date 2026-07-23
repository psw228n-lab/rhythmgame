import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MPEGDecoder } from "mpg123-decoder";
import { analyzePcm, createDifficultyNotes } from "./chartAnalysis.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const audioRelativePath = process.env.CHART_AUDIO_PATH || "public/audio/song.mp3";
const audioPath = resolve(projectRoot, audioRelativePath);
const outputDirectory = resolve(projectRoot, "public/charts");
const title = "I Really Want to Stay at Your House";

console.log(`[chart] 실제 오디오 디코딩 시작: ${audioRelativePath}`);
const input = new Uint8Array(await readFile(audioPath));
const decoder = new MPEGDecoder({ enableGapless: true });
await decoder.ready;
const decoded = decoder.decode(input);
decoder.free();

if (!decoded.samplesDecoded || !decoded.channelData.length) throw new Error("MP3 디코더가 PCM 샘플을 반환하지 않았습니다.");
if (decoded.errors.length) console.warn(`[chart] 디코딩 경고 ${decoded.errors.length}건이 있었지만 복구 가능한 프레임은 계속 분석합니다.`);

console.log(`[chart] ${decoded.sampleRate}Hz · ${decoded.channelData.length}ch · ${decoded.samplesDecoded.toLocaleString()} samples`);
const analysis = analyzePcm(decoded.channelData, decoded.sampleRate);
console.log(`[chart] 추정 BPM: ${analysis.bpm} · 온셋: ${analysis.onsets.length.toLocaleString()} · 첫 유효음: ${analysis.firstSound.toFixed(3)}s`);

await mkdir(outputDirectory, { recursive: true });
for (const difficulty of ["easy", "normal", "hard"]) {
  const notes = createDifficultyNotes(analysis, difficulty);
  if (!notes.length) throw new Error(`${difficulty} 채보가 비어 있습니다. 분석 설정을 확인해 주세요.`);
  const chart = {
    title,
    audio: "./audio/song.mp3",
    offset: 0,
    bpm: analysis.bpm,
    difficulty,
    notes,
    analysis: {
      duration: Number(analysis.duration.toFixed(4)),
      firstSound: Number(analysis.firstSound.toFixed(4)),
      generatedAt: new Date().toISOString(),
    },
  };
  const outputPath = resolve(outputDirectory, `${difficulty}.json`);
  await writeFile(outputPath, `${JSON.stringify(chart, null, 2)}\n`, "utf8");
  console.log(`[chart] ${difficulty.padEnd(6)} ${String(notes.length).padStart(4)} notes · ${(notes.length / analysis.duration).toFixed(2)} notes/sec`);
}
console.log("[chart] 생성 완료: public/charts/easy.json, normal.json, hard.json");
