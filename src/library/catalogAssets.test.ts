import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalog, isAvailable } from './catalog'

const ROOT = path.resolve(__dirname, '../..')
const fileSounds = catalog.flatMap((s) => (s.source.kind === 'file' ? [{ id: s.id, src: s.source.src }] : []))

describe('catalog file assets', () => {
  it('has file-backed sounds to check (guards against this suite going vacuous)', () => {
    expect(fileSounds.length).toBeGreaterThan(0)
  })

  it('every available file sound has its asset under public/', () => {
    const missing = fileSounds.filter((s) => isAvailable(s.id) && !existsSync(path.join(ROOT, 'public', s.src)))
    expect(missing).toEqual([])
  })

  it('the sound pipeline (scripts/sounds) outputs exactly the files the catalog references', () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'scripts/sounds/manifest.json'), 'utf8')) as {
      sounds: { catalogId?: string }[]
    }
    // process.mjs writes public/sounds/{catalogId}.m4a
    const outputs = manifest.sounds.flatMap((s) => (s.catalogId ? [`sounds/${s.catalogId}.m4a`] : []))
    expect(outputs.sort()).toEqual(fileSounds.map((s) => s.src).sort())
  })
})
