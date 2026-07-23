import { defineConfig } from "vitest/config";

// 사이트용 Cloudflare 플러그인과 분리된 순수 Node 테스트 환경입니다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,mjs}"],
  },
});
