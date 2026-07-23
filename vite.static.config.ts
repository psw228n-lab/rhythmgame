import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

// GitHub Pages에서는 저장소 이름을 기본 경로로 사용하고, 로컬 빌드에서는 루트를 사용합니다.
export default defineConfig({
  base: repository ? `/${repository}/` : "/",
  plugins: [react()],
  build: { outDir: "dist-pages", emptyOutDir: true },
});
