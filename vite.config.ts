/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    // WSL drvfs(/mnt/d)에서 병렬 워커의 jsdom import가 스폰 타임아웃 유발 —
    // 단일 스레드 직렬 실행으로 모듈 캐시 재사용 (첫 파일만 import 비용 부담)
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
})
