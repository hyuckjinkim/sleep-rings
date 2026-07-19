#!/usr/bin/env node
// raw/{category}/{id}.* 를 후처리(라우드니스 정규화+루프 크로스페이드+AAC 변환)해 public/sounds/{category}/{id}.m4a 로 만든다.
// ffmpeg가 없으면 설치를 시도하지 않고 블로커로 보고만 하고 종료한다.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(SCRIPT_DIR, "raw");
const OUT_DIR = path.join(SCRIPT_DIR, "..", "..", "public", "sounds");

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasFfmpeg()) {
  console.error("[블로커] ffmpeg가 이 시스템에 설치되어 있지 않음 (`which ffmpeg` → not found).");
  console.error("설치를 자동 시도하지 않음(지시에 따름). ffmpeg 설치 후 재실행하면 후처리 진행됨.");
  console.error("설치 예시(WSL/Ubuntu): sudo apt-get install ffmpeg");
  process.exit(1);
}

if (!existsSync(RAW_DIR)) {
  console.log("raw/ 디렉토리에 처리할 원본 파일이 없음.");
  process.exit(0);
}

let processed = 0;
let failed = 0;

for (const category of readdirSync(RAW_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const catDir = path.join(RAW_DIR, category.name);
  const outCatDir = path.join(OUT_DIR, category.name);
  mkdirSync(outCatDir, { recursive: true });

  for (const file of readdirSync(catDir)) {
    const id = path.parse(file).name;
    const inPath = path.join(catDir, file);
    const outPath = path.join(outCatDir, `${id}.m4a`);
    // 라우드니스 정규화(EBU R128) + 시작/끝 50ms 크로스페이드(클릭 노이즈 제거) + AAC 96kbps 변환.
    // 완전 심리스 루프 포인트 탐지는 v1 범위 밖 — Web Audio loopStart/loopEnd 튜닝으로 후속 보완(docs/sound-sources.md §4.3).
    const filter = "loudnorm=I=-23:TP=-2:LRA=7,afade=t=in:d=0.05,afade=t=out:st=-0.05:d=0.05";
    try {
      execFileSync("ffmpeg", [
        "-y", "-i", inPath,
        "-af", filter,
        "-ar", "44100",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        outPath,
      ], { stdio: "inherit" });
      processed++;
    } catch (err) {
      console.error(`[실패] ${category.name}/${file}: ${err.message}`);
      failed++;
    }
  }
}

console.log(`\n처리 완료: ${processed}, 실패: ${failed}`);
