import type { RefObject } from 'react'

/** Bottom band (as a fraction of field height) where dropping/releasing an orb deletes it. */
export function isInDeleteZone(fieldRef: RefObject<HTMLDivElement | null>, clientY: number): boolean {
  const rect = fieldRef.current?.getBoundingClientRect()
  if (!rect) return false
  return clientY >= rect.bottom - rect.height * 0.22
}
