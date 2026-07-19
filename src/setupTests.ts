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
