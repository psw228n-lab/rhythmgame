"use client";

import { useState, type FormEvent } from "react";
import { rankingService } from "../services/rankingService";

interface Props {
  initialName: string;
  onSaved: (name: string) => void;
}

export default function PlayerNameGate({ initialName, onSaved }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const savedName = await rankingService.claimPlayerName(name);
      onSaved(savedName);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "닉네임을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="player-gate" role="dialog" aria-modal="true" aria-labelledby="player-gate-title">
      <form className="player-gate-card" onSubmit={submit}>
        <span className="eyebrow">PLAYER REGISTRATION</span>
        <div className="player-gate-mark" aria-hidden="true"><span>A</span></div>
        <h1 id="player-gate-title">이름을 입력하세요</h1>
        <p>리더보드에서 사용할 고유 닉네임입니다. 같은 브라우저에서는 다음 방문에도 자동으로 불러옵니다.</p>
        <label>
          <span>PLAYER NAME</span>
          <input
            autoFocus
            value={name}
            minLength={2}
            maxLength={16}
            autoComplete="nickname"
            placeholder="2–16 CHARACTERS"
            disabled={submitting}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <div className="player-gate-error" role="alert">{error}</div>}
        <button className="button button-primary" type="submit" disabled={submitting || name.trim().length < 2}>
          {submitting ? "CHECKING NAME..." : "ENTER THE ARCHIVE"}
        </button>
      </form>
    </div>
  );
}
