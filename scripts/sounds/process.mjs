#!/usr/bin/env node
// manifest.json에서 catalogId가 있는 항목만 raw/{category}/{id}.* → public/sounds/{catalogId}.m4a 로
// 후처리(라우드니스 정규화+루프 크로스페이드+AAC 변환)한다. 출력 경로는 src/library/catalog.ts의
// file 소스(`sounds/{catalogId}.m4a`)와 1:1 — catalogAssets.test.ts가 이 대응을 검사한다.
// ffmpeg가 없으면 설치를 시도하지 않고 블로커로 보고만 하고 종료한다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(SCRIPT_DIR, "raw");
const OUT_DIR = path.join(SCRIPT_DIR, "..", "..", "public", "sounds");
const { sounds } = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "manifest.json"), "utf8"));

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

// 루프 크로스페이드: 원본 길이 L, 겹침 X초.
//   head = [0, X), body = [X, L). body의 마지막 X초 위에 head를 겹쳐(acrossfade) 굽는다.
//   결과(길이 L-X)는 원본 X초 지점에서 시작해, 끝에서 head로 넘어가 원본 X초 지점에서 끝난다.
//   → 끝 샘플 다음이 곧 첫 샘플이라 AudioBufferSourceNode.loop의 이음새가 연속이다.
// 예전 필터(afade in/out 50ms)는 양 끝을 무음 쪽으로 줄여, 반복마다 볼륨이 꺼졌다 켜지는 딥을 만들었다.
// 곡선은 qsin(등전력) — 상관없는 잡음성 소리를 겹칠 때 중간 지점 음량이 꺼지지 않는다.
// 원본은 2X초보다 길어야 한다. AAC 프라이밍/패딩(TN2258)은 여전히 남으므로 실기기 디코드 길이를 확인해
// 필요하면 catalog의 loopStart/loopEnd로 잘라낸다. (ffmpeg 미설치 환경에서 작성 — 실제 실행 검증 전)
const LOOP_XFADE_SEC = 3;
const LOOP_FILTER = [
  "[0:a]loudnorm=I=-23:TP=-2:LRA=7,asplit[a][b]",
  `[a]atrim=start=${LOOP_XFADE_SEC},asetpts=PTS-STARTPTS[body]`,
  `[b]atrim=end=${LOOP_XFADE_SEC},asetpts=PTS-STARTPTS[head]`,
  `[body][head]acrossfade=d=${LOOP_XFADE_SEC}:c1=qsin:c2=qsin[out]`,
].join(";");

let processed = 0;
let failed = 0;
let missing = 0;
mkdirSync(OUT_DIR, { recursive: true });

for (const { id, category, catalogId } of sounds.filter((x) => x.catalogId)) {
  const catDir = path.join(RAW_DIR, category);
  const file = existsSync(catDir) ? readdirSync(catDir).find((f) => path.parse(f).name === id) : undefined;
  if (!file) {
    console.error(`[원본 없음] ${catalogId} ← raw/${category}/${id}.* (docs/sound-manual-downloads.md 참고)`);
    missing++;
    continue;
  }
  const inPath = path.join(catDir, file);
  const outPath = path.join(OUT_DIR, `${catalogId}.m4a`);
  try {
    execFileSync("ffmpeg", [
      "-y", "-i", inPath,
      "-filter_complex", LOOP_FILTER,
      "-map", "[out]",
      "-ar", "44100",
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      outPath,
    ], { stdio: "inherit" });
    processed++;
  } catch (err) {
    console.error(`[실패] ${category}/${file}: ${err.message}`);
    failed++;
  }
}

console.log(`\n처리 완료: ${processed}, 실패: ${failed}, 원본 없음: ${missing}`);
