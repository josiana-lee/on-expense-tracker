# 브랜드 자산

로고는 그려서 넣는 게 아니라 **생성**한다. 팔레트·지오메트리는 전부
[`scripts/brand.mjs`](../scripts/brand.mjs) 한 곳에 있고, 나머지는 거기서 나온다.

```bash
pnpm brand       # SVG만 다시 생성
pnpm brand:png   # SVG + PNG (브라우저 필요, 아래 참고)
```

## 마크

카테고리 원 5개(코랄·옐로·민트·블루·라벤더)가 꽃잎처럼 모이고 가운데에 '추가'
플러스가 잉크 선으로 얹힌다. 색 순서는 고정 — 팔레트를 바꾸려면 `PALETTE`만
고치고 `pnpm brand`.

원본은 스토어가 요구하는 1024×1024 정사각형 좌표계로 표현돼 있다.

## 스케일이 두 개인 이유

| | 값 | 쓰는 곳 |
|---|---|---|
| `SCALE.full` | 0.92 | 잘리지 않는 평면 아이콘 (스토어, iOS) |
| `SCALE.safe` | 0.72 | 런처가 마스킹하는 아이콘 (안드로이드 어댑티브, PWA maskable) |

안드로이드는 108dp 캔버스 중 가운데 66dp만 보장한다. 1024 좌표계로 반지름 313.
마크 반지름은 스케일 1에서 428이므로 `428 × s ≤ 313`, 즉 **s ≤ 0.731**.

`full`(0.92)은 마스킹용으로 쓰면 안 된다. 반지름이 394라 원형 마스크가 남기는
영역(341)조차 넘어서 바깥 꽃잎이 깎인다. `scripts/build-brand.mjs`가 빌드할 때
이 조건을 검사하고, 넘으면 에러를 내고 멈춘다.

## 다크 아이콘

디자인 문서의 다크 아이콘은 꽃잎 그룹에 `mix-blend-mode: multiply`가 걸린 채
어두운 배경(#1B1E25) 위에 올라간다. 파스텔을 어두운 색에 곱하면 전부 검정에
가까워져서 **마크가 보이지 않는다.** 그래서 다크 변형만 multiply를 끈다
(`markSvg({ multiply: false })`). 꽃잎끼리는 원래 섞이지 않으므로 잃는 건 없다.

## PNG를 브라우저로 뽑는 이유

마크는 `mix-blend-mode`를 쓰고 스플래시는 Pretendard로 글자를 얹는다. 커맨드라인
래스터라이저는 둘 다 지원이 들쭉날쭉해서, 앱을 그리는 것과 같은 엔진에서
렌더해야 결과가 시안과 같다는 걸 보장할 수 있다.

`pnpm brand:png`는 작은 서버를 띄우고 주소를 출력한다. 그 주소를 브라우저로 열면
페이지가 모든 비트맵을 그려서 서버로 돌려보내고, 서버가 파일로 쓴다. "wrote N
files"가 뜨면 Ctrl-C.

## 산출물

### `public/` — 웹에서 서빙

| 파일 | 용도 |
|---|---|
| `favicon.svg`, `favicon-32.png` | 브라우저 탭 |
| `apple-touch-icon.png` | iOS 홈 화면 추가 |
| `icon-192.png`, `icon-512.png` | PWA 매니페스트 (`any`) |
| `icon-maskable-512.png` | PWA 매니페스트 (`maskable`) |
| `logo-light.svg`, `logo-dark.svg` | 설정 화면 하단 락업 (테마별로 CSS가 고름) |

### `assets/` — 네이티브 패키징 입력

[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets)가 읽는
관례적 위치. 안드로이드 프로젝트를 만든 뒤:

```bash
npx @capacitor/assets generate --android
```

| 파일 | 용도 |
|---|---|
| `icon-only.png` | 레거시 정사각 런처 아이콘 |
| `icon-foreground.png` / `icon-background.png` | 어댑티브 아이콘 두 레이어 |
| `icon-monochrome.png` | Material You 테마 아이콘. 시스템이 알파로 틴트하므로 플러스는 칠하지 않고 **뚫려** 있다 |
| `icon-notification.png` | 알림 아이콘. 같은 이유로 흰색 실루엣 + 뚫린 플러스 |
| `splash.png` / `splash-dark.png` | 2732² 스플래시. 화면 비율에 맞춰 가운데를 잘라 쓰므로 락업은 중앙에만 둔다 |

`assets/brand/*.svg`는 위 PNG들의 원본이다. 벡터가 필요한 곳(스토어 그래픽,
인쇄물)에서는 이쪽을 쓴다.

## 아직 안 한 것

- 스토어 등록용 그래픽(피처 그래픽, 스크린샷 프레임)은 디자인 문서의 별도
  파일(`On Store Graphics.dc.html`)에 있고 아직 옮기지 않았다.
- 스플래시가 "톡" 하고 켜지는 0.4초 스프링은 네이티브 스플래시로는 표현이 안 된다.
  Capacitor 스플래시를 끄고 앱 첫 프레임에서 재현할지는 패키징할 때 결정한다.
