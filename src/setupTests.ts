import '@testing-library/jest-dom/vitest'

// jsdom implements the PointerEvent constructor but not pointer capture (Orb.tsx calls
// setPointerCapture unconditionally on every pointerdown) — stub the trio as no-ops.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function (_pointerId: number) {}
  Element.prototype.releasePointerCapture = function (_pointerId: number) {}
  Element.prototype.hasPointerCapture = function (_pointerId: number) {
    return false
  }
}

// i18n now follows the device language when nothing is saved; jsdom reports en-US, but the suites
// assert Korean copy. Pin the saved choice before src/i18n initializes.
localStorage.setItem('so.lang', 'ko')
