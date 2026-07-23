import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RhythmGame from "./components/RhythmGame";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("정적 페이지의 #root 요소를 찾을 수 없습니다.");

createRoot(root).render(
  <StrictMode>
    <RhythmGame />
  </StrictMode>,
);
