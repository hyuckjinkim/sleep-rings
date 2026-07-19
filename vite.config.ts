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
    // 파일 직렬 실행으로 워커 동시 스폰 경합 제거 (vitest 4: poolOptions 대신 top-level)
    pool: 'threads',
    fileParallelism: false,
  },
})
