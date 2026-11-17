/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Cloudflare quick tunnel(npm run web:tunnel)로 폰에서 접속 — Vite는 모르는 Host 헤더를 차단한다.
  // preview.allowedHosts 기본값이 server.allowedHosts라 dev/preview 둘 다 적용됨.
  server: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    // WSL drvfs(/mnt/d)에서 병렬 워커의 jsdom import가 스폰 타임아웃 유발 —
    // 파일 직렬 실행으로 워커 동시 스폰 경합 제거 (vitest 4: poolOptions 대신 top-level)
    pool: 'threads',
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})
