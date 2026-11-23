// ESLint flat config (.styleguide app §2.4) — Vite 공식 React 템플릿(create-vite react-ts)과 같은 구성:
// @eslint/js recommended + typescript-eslint recommended + react-hooks + react-refresh(vite).
// ESLint 는 9 를 쓴다: 앱 두 저장소를 같은 판으로 맞춘다(wayfinder 의 eslint-config-expo 가 아직 10 을 지원하지 않는다).
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['.omc/', 'dist/', 'coverage/', 'android/', 'ios/', 'test-results/', 'playwright-report/', '.wrangler/']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: { globals: globals.browser },
    rules: {
      // 밑줄로 시작하는 이름은 「일부러 안 쓴다」는 표시(typescript-eslint 문서의 관례).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 컴포넌트 파일은 컴포넌트만 내보낸다(HMR). 순수 함수는 geometry.ts·deleteZone.ts·soundIcons.ts 로.
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
])
