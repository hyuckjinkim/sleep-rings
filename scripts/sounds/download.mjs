#!/usr/bin/env node
// archive.org 항목만 자동 다운로드한다. Pixabay는 ToS가 스크립트 다운로드를 금지해 코드에 아예 없음.
// manual(Freesound 등)/synthesized 항목은 스킵하고 안내만 출력한다.
// 사용법: node scripts/sounds/download.mjs
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = new URL("./manifest.json", import.meta.url);
const { sounds } = JSON.parse(await readFile(manifestPath, "utf8"));

const RAW_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "raw");
const MAX_RETRIES = 3;

async function downloadWithRetry(url, destPath) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(destPath, buf);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      return { bytes: buf.length, sha256 };
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`  재시도 ${attempt}/${MAX_RETRIES} (${err.message})`);
    }
  }
}

let downloaded = 0;
let skippedManual = 0;
let skippedSynth = 0;
let failed = 0;

for (const sound of sounds) {
  if (sound.source === "synthesized") {
    skippedSynth++;
    continue;
  }
  if (sound.source === "manual") {
    console.log(`[수동 필요] ${sound.category}/${sound.id} — ${sound.sourceUrl} (docs/sound-manual-downloads.md 참고)`);
    skippedManual++;
    continue;
  }
  if (sound.source === "archive.org") {
    // archiveIdentifier/archiveFilename 필드가 manifest 항목에 있어야 함.
    // https://archive.org/download/{identifier}/{filename} 은 인증 없이 직접 접근 가능(확인 완료).
    if (!sound.archiveIdentifier || !sound.archiveFilename) {
      console.error(`[스킵] ${sound.id} — archiveIdentifier/archiveFilename 누락`);
      failed++;
      continue;
    }
    const url = `https://archive.org/download/${sound.archiveIdentifier}/${sound.archiveFilename}`;
    const ext = path.extname(sound.archiveFilename) || ".mp3";
    const dest = path.join(RAW_DIR, sound.category, `${sound.id}${ext}`);
    try {
      console.log(`[다운로드] ${sound.id} ← ${url}`);
      const { bytes, sha256 } = await downloadWithRetry(url, dest);
      console.log(`  완료: ${dest} (${bytes} bytes, sha256=${sha256.slice(0, 12)}...)`);
      downloaded++;
    } catch (err) {
      console.error(`  실패: ${sound.id} — ${err.message}`);
      failed++;
    }
    continue;
  }
  console.warn(`[알 수 없는 source] ${sound.id}: ${sound.source}`);
}

console.log("\n--- 요약 ---");
console.log(`자동 다운로드 성공: ${downloaded}`);
console.log(`자동 다운로드 실패: ${failed}`);
console.log(`수동 다운로드 대기(Freesound 등): ${skippedManual}`);
console.log(`합성 대상(다운로드 불필요): ${skippedSynth}`);
if (downloaded === 0 && failed === 0) {
  console.log("\n현재 manifest.json에 source:\"archive.org\" 항목이 없음 — 개별 검증 통과 항목 0건(docs/sound-sources.md, manifest.json _archiveOrgVerification 참고).");
}
