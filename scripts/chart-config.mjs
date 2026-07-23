// 자동 채보의 분석 민감도와 난이도별 밀도 제한을 한곳에서 조절합니다.
export const analysisConfig = {
  frameSize: 2048,
  hopSize: 512,
  onsetThreshold: 1.15,
  minOnsetGap: 0.075,
  bpmMin: 70,
  bpmMax: 180,
  silenceRatio: 0.035,
};

export const difficultyConfig = {
  easy: { subdivision: 1, minGap: 0.3, maxNps: 2.4, detailThreshold: 0.82 },
  normal: { subdivision: 2, minGap: 0.14, maxNps: 4.5, detailThreshold: 0.54 },
  hard: { subdivision: 4, minGap: 0.075, maxNps: 7.2, detailThreshold: 0.32 },
};
