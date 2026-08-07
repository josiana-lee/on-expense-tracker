import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_INFO } from './appInfo';
import { APP_VERSION } from '../db/backup';

/* 버전 숫자가 세 군데에 손으로 적혀 있다.
 *
 *   android/app/build.gradle  versionName  — 스토어와 기기에 뜨는 이름
 *   src/data/appInfo.ts       version      — 설정 화면의 "버전" 줄
 *   src/db/backup.ts          APP_VERSION  — 백업 파일에 찍히는 값
 *
 * 어긋나도 아무것도 깨지지 않는다는 게 문제다. 화면에는 1.0.0이 뜨는데
 * 백업 파일은 1.0.1을 주장하고, 나중에 그 파일을 열어보면 어느 쪽이 맞는지
 * 알 방법이 없다. 출시된 적 없는 버전을 주장하는 백업이 만들어지는 셈이다.
 * 릴리스마다 손으로 맞추는 것에 기대는 대신 여기서 막는다. */

/* import.meta.url이 아니라 cwd 기준 — vite가 모듈을 http로 서빙해서
   import.meta.url이 file: URL이 아니고, vitest는 프로젝트 루트에서 돈다. */
const gradle = readFileSync(resolve(process.cwd(), 'android/app/build.gradle'), 'utf8');

function gradleValue(key: 'versionName' | 'versionCode'): string {
  const m = gradle.match(new RegExp(`^\\s*${key}\\s+"?([^"\\s]+)"?\\s*$`, 'm'));
  if (!m) throw new Error(`build.gradle에서 ${key}를 찾지 못했어`);
  return m[1];
}

describe('버전 표기', () => {
  it('세 군데가 같은 값을 가리킨다', () => {
    const versionName = gradleValue('versionName');
    expect(APP_INFO.version).toBe(versionName);
    expect(APP_VERSION).toBe(versionName);
  });

  it('versionName은 semver 형태다', () => {
    expect(gradleValue('versionName')).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /* versionCode는 versionName과 별개다 — Play가 업로드 순서를 매기는
     정수이고 사용자에게는 보이지 않는다. 값이 뭔지는 여기서 알 수 없지만,
     정수이고 1 이상인지는 확인할 수 있다. 0이나 소수점이 들어가면 업로드가
     거절되는데 그 사실은 Play Console에 올린 뒤에야 알게 된다. */
  it('versionCode는 1 이상의 정수다', () => {
    const code = gradleValue('versionCode');
    expect(code).toMatch(/^\d+$/);
    expect(Number(code)).toBeGreaterThanOrEqual(1);
  });
});
