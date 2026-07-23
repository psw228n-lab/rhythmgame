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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    rankingService.savePlayerName(name);
    const savedName = rankingService.getPlayerName();
    if (savedName.length < 2) {
      setError("플레이어 이름을 2자 이상 입력해 주세요.");
      return;
    }
    onSaved(savedName);
  };

  return (
    <div className="player-gate" role="dialog" aria-modal="true" aria-labelledby="player-gate-title">
      <form className="player-gate-card" onSubmit={submit}>
        <span className="eyebrow">PLAYER REGISTRATION</span>
        <div className="player-gate-mark" aria-hidden="true"><span>A</span></div>
        <h1 id="player-gate-title">이름을 입력하세요</h1>
        <p>플레이 결과와 글로벌 리더보드에 표시할 이름입니다. 이 브라우저에 저장되며 언제든 상단에서 변경할 수 있습니다.</p>
        <label>
          <span>PLAYER NAME</span>
          <input
            autoFocus
            value={name}
            minLength={2}
            maxLength={16}
            autoComplete="nickname"
            placeholder="2–16 CHARACTERS"
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <div className="player-gate-error" role="alert">{error}</div>}
        <button className="button button-primary" type="submit" disabled={name.trim().length < 2}>
          ENTER THE ARCHIVE
        </button>
      </form>
    </div>
  );
}
