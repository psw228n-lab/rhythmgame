"use client";

import { useState } from "react";
import type { ScoreSubmission as ScorePayload } from "../services/rankingService";
import { rankingService } from "../services/rankingService";

interface Props { score: Omit<ScorePayload, "playerName">; onSubmitted: () => void; }

export default function ScoreSubmission({ score, onSubmitted }: Props) {
  const [name, setName] = useState(() => rankingService.getPlayerName());
  const [status, setStatus] = useState(rankingService.isCloudConfigured() ? "닉네임을 입력해 글로벌 랭킹에 등록하세요." : rankingService.getConfigMessage());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await rankingService.submitScore({ ...score, playerName: name });
      setDone(true);
      setStatus("글로벌 랭킹 등록이 완료되었습니다.");
      onSubmitted();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "랭킹을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="score-submit-panel">
      <div className="score-submit-form">
        <input aria-label="랭킹 닉네임" value={name} maxLength={16} disabled={done || !rankingService.isCloudConfigured()} placeholder="PLAYER NAME" onChange={(event) => setName(event.target.value)} />
        <button className="button button-primary" disabled={done || submitting || !rankingService.isCloudConfigured()} onClick={submit}>{done ? "REGISTERED" : submitting ? "UPLOADING" : "REGISTER SCORE"}</button>
      </div>
      <p>{status}</p>
    </div>
  );
}
