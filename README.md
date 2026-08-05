# 온:On 지출 가계부

열자마자 3초 안에 지출 입력이 끝나는 가계부. Android 우선.

대부분의 가계부는 달력이나 목록이 첫 화면이라 입력까지 두세 번을 눌러야 한다.
이 앱은 **첫 화면이 곧 입력 화면**이다. 금액 치고, 카테고리 찍고, 추가. 끝.

그 3초가 이 앱의 전부라서, 입력 경로에 프레임을 떨어뜨리거나 중복 저장 여지를
남기는 변경은 다른 걸 아무리 얻어도 손해다.

## 서버가 없다

로그인도, 계정도, 동기화도 없다. 모든 기록은 기기 안 IndexedDB에만 있고 회사가
열람할 수단이 없다. 데이터를 옮기는 유일한 경로는 사용자가 직접 만드는 백업
파일이다.

이건 편의를 위한 타협이 아니라 제품 결정이다. 새 기능을 넣을 때 "이건 서버가
있어야 하는데"라는 생각이 들면, 그 기능이 아니라 설계를 다시 본다.

## 상태

아직 출시 전이다.

| 영역 | 상태 |
|---|---|
| 앱 기능 | 구현 완료. 브라우저에서 검증됨 |
| 안드로이드 패키징 | 디버그 APK 빌드 통과. 아이콘·스플래시·권한 모두 패키징 확인 |
| 네이티브 기능 | 백업 저장·공유·알림을 Capacitor 플러그인으로 교체 완료. **기기에서 확인 안 함** |
| 실기기 | **한 번도 안 돌려봄.** 지금까지 전부 브라우저 에뮬레이션 |
| 광고 | 첫 출시에는 없음. 애드핏이 실제 스토어 URL을 요구해서 등록이 안 됨 |

남은 순서와 손으로 해야 하는 것들은 [docs/release-checklist.md](docs/release-checklist.md)에 있다.

## 시작하기

Node 20.6 이상 (`.nvmrc`는 24), pnpm.

```bash
pnpm install && pnpm dev
```

| 명령 | 하는 일 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 타입체크 + 프로덕션 빌드 |
| `pnpm test` | 유닛 테스트 (fake-indexeddb 위에서 실제 DB 로직 검증) |
| `pnpm typecheck` | 타입만 |
| `pnpm brand` | 로고 SVG 재생성 |
| `pnpm brand:png` | 로고 PNG까지 (브라우저 필요 — [docs/brand-assets.md](docs/brand-assets.md)) |
| `pnpm policy` | 개인정보처리방침 HTML 생성 |
| `pnpm android:icons` | 안드로이드 아이콘·스플래시 재생성 |

| `pnpm android:apk` | 디버그 APK (사이드로드용) |
| `pnpm android:aab` | 릴리스 번들 (Play Console 업로드용) |

안드로이드 빌드는 `./gradlew`를 직접 부르지 말고 위 스크립트를 쓴다. JDK가
keg-only로 설치돼 PATH에 없고, 스크립트가 `pnpm build && npx cap sync`까지
해줘서 직전 웹 빌드가 패키징되는 사고를 막아준다.

## 구조

```
src/
  screens/     화면. 탭 하나가 폴더 하나 (input · calendar · budget · assets · settings)
  components/  화면 간 공유 UI (Keypad, Sheet, Toast, TabBar …)
  db/          Dexie 스키마와 모든 데이터 접근. 화면은 여기를 통해서만 DB를 만진다
  hooks/       useLiveQuery 래퍼. 화면이 실제로 읽는 창구
  lib/         포맷·CSV·파일 저장 같은 순수 유틸
  styles/      토큰(tokens.css)과 공통 애니메이션
scripts/       브랜드·방침·안드로이드 아이콘 생성기
assets/        네이티브 패키징 입력 (@capacitor/assets 관례)
docs/          설계 문서
```

## 알아두면 덜 다치는 것들

전부 겪고 나서 적은 것들이다. 자세한 근거는 [docs/data-model.md](docs/data-model.md)에 있다.

**금액은 정수 minor unit이다.** 원 단위 정수. float을 한 번 넣으면 그 시점부터
데이터가 오염되고 되돌릴 방법이 없다.

**날짜는 `'YYYY-MM-DD'` 로컬 문자열이다.** epoch이 아니다. 사전순이 곧 시간순이라
인덱스 레인지 스캔이 그대로 되고, 사용자가 시간대를 옮겨도 기록이 다른 날로
재분류되지 않는다.

**PK는 문자열 UUIDv7이다.** Dexie의 `++id` 자동증가를 쓰지 않는다. 백업·복원에서
ID가 충돌하지 않아야 하고, 이건 나중에 되돌리기 가장 어려운 결정이다.

**카테고리와 결제수단은 지우지 않고 보관 처리한다.** 지출이 `categoryId`를 직접
들고 있어서, 하드 삭제하면 과거 기록이 이름을 잃는다. 선택 목록은 보관된 걸
빼고 보여주지만 조회용 맵(`useCatalog()`의 `byId`)은 전부 들고 있다.

**Dexie `update`에서 `undefined`는 "그대로 둬"가 아니라 "이 필드를 지워"다.**
패치 객체를 만들 때 값이 있는 키만 붙여야 한다. 계좌 이름만 바꿔도 잔액과
종류가 같이 지워지는 버그가 실제로 있었고, 출시 전에 잡았다.

**삭제한 기록은 바로 사라지지 않는다.** 원본은 30일, 삭제 사실은 180일 남는다.
이 기간에 만든 백업 파일에는 삭제한 기록이 들어 있다.

**프리셋은 상수가 원본이고 DB는 사용자 사본이다.** 사용자가 고친 필드는
`customizedFields`로 추적해서, 앱 업데이트가 프리셋을 갱신할 때 사용자가 직접
바꾼 값만 건드리지 않는다.

**`@keyframes`는 쓰는 CSS 모듈마다 각각 선언해야 한다.** 이 프로젝트의 CSS
Modules 파이프라인은 `animation-name`을 무조건 해싱하기 때문에, 공용 파일에
선언해두고 다른 파일에서 참조하면 **에러 없이 조용히 아무 일도 안 일어난다.**
그래서 `chipPop` 같은 게 여러 파일에 중복 선언돼 있다 — 정리 대상이 아니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/design-brief.md](docs/design-brief.md) | 화면 구성과 애니메이션 원칙 |
| [docs/data-model.md](docs/data-model.md) | 스키마와 그렇게 정한 이유 |
| [docs/brand-assets.md](docs/brand-assets.md) | 로고·아이콘 생성 방식 |
| [docs/release-checklist.md](docs/release-checklist.md) | 출시까지 남은 것 |
| [docs/privacy-policy.md](docs/privacy-policy.md) | 개인정보처리방침 원본 |

## 기술

React 19 · Vite 6 · TypeScript · Dexie 4 (IndexedDB) · Zod 4 · Vitest ·
Capacitor 8

UI는 원래 HTML/CSS 시안으로 나와 있어서 애니메이션까지 그대로 옮길 수 있었고,
로컬 전용이라 네이티브 의존이 없어서 웹으로 만들고 Capacitor로 감싸는 쪽이
자연스러웠다.

---

© 2026 JDB Labs · 문의 jdblabskento@gmail.com
