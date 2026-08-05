# 출시 체크리스트 — Google Play

첫 출시 기준. 완료된 항목은 그대로 두고, 다음 릴리스 때는 "매 릴리스마다"만
다시 훑으면 된다.

## 1. 개인정보처리방침 게시 — **직접 해야 함**

앱에는 이미 주소가 박혀 있다
(`https://josiana-lee.github.io/jdb-labs-policies/on-expense/`).
아직 아무것도 없어서 **지금은 404다.** 스토어 등록 전에 반드시 살려야 한다.

로컬에 커밋까지 끝난 레포가 `~/jdb-labs-policies`에 준비돼 있다.

- [ ] GitHub에서 **public** 레포 `jdb-labs-policies` 생성 (설명·README·라이선스 체크 없이 빈 레포로)
- [ ] 푸시

  ```bash
  cd ~/jdb-labs-policies && git remote add origin https://github.com/josiana-lee/jdb-labs-policies.git && git push -u origin main
  ```

- [ ] 레포 Settings → Pages → Source를 `main` / `/ (root)`로
- [ ] 몇 분 뒤 위 주소가 열리는지 확인 (로그인 안 한 브라우저로)

> private 레포로는 Pages가 안 뜬다. 무료 계정 제한이고, 스토어 심사도 로그인
> 없이 열리는 주소를 요구한다. 가계부 소스코드 레포는 계속 private로 둔다.

내용을 고칠 때는 이 레포의 HTML을 직접 건드리지 않는다. 원본은
`docs/privacy-policy.md`이고, 아래로 다시 생성한다.

```bash
node scripts/build-policy.mjs --date=2026-08-05 --out=../jdb-labs-policies/on-expense/index.html
```

`--date`는 **처음 게시한 날**을 그대로 유지한다. 실제로 내용을 바꿔 새로
시행하는 경우에만 올리고, 그때는 방침 제11조대로 최소 7일 전에 고지한다.

## 2. 빌드 환경 — 완료

- [x] OpenJDK 21 (`brew install openjdk@21` — cask가 아니라 formula라서
      비밀번호가 필요 없다. 대신 keg-only라 PATH에 안 올라간다)
- [x] Android SDK에 `platforms;android-36` + `build-tools;36.0.0` 추가
      (프로젝트가 compileSdk 36을 쓰는데 android-34만 있었다)
- [x] `assembleDebug` 통과 — 첫 빌드 10분 29초, 184 tasks

```bash
pnpm android:apk   # 디버그 APK (사이드로드용)
pnpm android:aab   # 릴리스 번들 (Play Console 업로드용)
```

`./gradlew`를 직접 부르지 말 것. JDK가 keg-only라 PATH에 없어서 "Java를 찾을
수 없다"고 나온다. 위 스크립트가 JDK를 찾아주고, **`pnpm build && npx cap sync`를
먼저 돌려준다** — 이걸 빼먹으면 직전 웹 빌드가 그대로 패키징되는데, APK가 폰에
올라가야만 보이는 종류의 실수다.

Android Studio는 없지만 커맨드라인 빌드에는 필요 없다.

## 3. 네이티브 기능 교체 — 코드는 끝, 기기 확인만 남음

브라우저 API 세 개는 안드로이드 WebView에 아예 없어서 **조용히 아무 일도 안
일어난다.** `navigator.share`가 없고, `<a download>` 클릭은 호스트 앱이
다운로드 리스너를 달아야 동작하는데 Capacitor는 달지 않는다. 웹 `Notification`도
없다. 전부 `isNative` 분기로 교체했고, 브라우저 경로는 그대로 살려뒀다(개발
서버가 실제로 화면을 보는 곳이라서).

- [x] `lib/download.ts` — Filesystem(캐시에 쓰기) + Share(시트에 넘기기)
- [x] `lib/notifications.ts` — LocalNotifications로 OS에 일일 알림 등록
- [x] 알림 안내문("앱이 완전히 꺼져 있으면…")을 브라우저 빌드에서만 표시
- [ ] `db/seed.ts`의 `navigator.storage.persist()`가 WebView에서 의미가 있는지 확인
      (앱 전용 저장소라 무의미할 가능성이 높다 — 실패해도 무해하므로 급하진 않음)

플러그인이 매니페스트에 합쳐 넣는 권한: `POST_NOTIFICATIONS`(안드로이드 13+),
`RECEIVE_BOOT_COMPLETED`(재부팅 후에도 알림 유지), `WAKE_LOCK`.

## 4. 실기기 검증 — 아직 안 함

**지금까지 전부 브라우저 에뮬레이션이다.** 실제 안드로이드에서 돌려본 적이 없다.

- [ ] 백업 파일 저장 → 실제로 파일이 남는지
- [ ] 백업 파일 복원 → 파일 선택 다이얼로그가 뜨는지
- [ ] CSV 내보내기
- [ ] 알림이 예약 시각에 울리는지 (앱을 완전히 종료한 상태 포함)
- [ ] 런처 아이콘 — 원형·스퀴클 두 런처에서, 그리고 테마 아이콘(Material You) 켜고
- [ ] 스플래시 — 라이트/다크
- [ ] 폴더블 레이아웃. **DPR을 추정해서 맞춘 거라 실측이 꼭 필요하다**
- [ ] 뒤로가기 버튼 동작 (하위 화면에서 앱이 그냥 종료되지 않는지)

## 5. Play Console

- [ ] 본인인증 완료
- [ ] 앱 생성 — 패키지명 `com.jdblabs.onexpense` (**출시 후 영구 고정**)
- [ ] **데이터 보안 양식: "데이터를 수집하지 않음"**

  광고가 없고 서버가 없으므로 실제로 아무것도 수집하지 않는다. 이 양식과
  개인정보처리방침이 어긋나면 반려된다. 나중에 광고를 붙이면 양식과 방침을
  **같이** 고쳐야 한다.

- [ ] 개인정보처리방침 URL 입력 (1번에서 살린 주소)
- [ ] 콘텐츠 등급 설문
- [ ] 스토어 등록정보 — 스크린샷, 피처 그래픽
      (`On Store Graphics.dc.html` 시안이 있으나 아직 옮기지 않음)
- [ ] 업로드 키 / 서명 키 생성. **키스토어를 잃어버리면 이 앱은 영원히 업데이트할 수 없다.** 안전한 곳에 백업

## 매 릴리스마다

세 곳의 버전이 같이 움직여야 한다. 어긋나면 백업 파일이 출시된 적 없는 버전을
주장하게 된다.

- [ ] `src/data/appInfo.ts`의 `version`
- [ ] `db/backup.ts`의 `APP_VERSION`
- [ ] `android/app/build.gradle`의 `versionName` (위 둘과 동일하게)
- [ ] `android/app/build.gradle`의 `versionCode` — **정수, 매번 증가, 재사용 불가.**
      Play가 릴리스 순서를 이걸로 판단한다
- [ ] 브랜드 자산을 건드렸다면 `pnpm android:icons`
- [ ] `pnpm android:aab` (내부적으로 build + cap sync까지 한다)

## 출시 이후 — 광고

애드핏은 **실제 스토어 URL이 있어야** 안드로이드 매체를 등록할 수 있다.
그래서 첫 출시에는 광고가 없다.

- [ ] 스토어 등록 후 애드핏에 매체 등록
- [ ] `InputScreen.tsx`의 주석 자리에 `<AdSlot />` 복구. 높이는 애드핏 배너 실제 크기로 (지금 예약값 52px는 AdMob 기준 추정치)
- [ ] `docs/privacy-policy.md`에 광고 절 추가하고, 제6조의 "광고가 포함되어 있지 않으며" 문장 수정
- [ ] 방침 재생성 후 푸시, Play Console 데이터 보안 양식도 같이 수정

## 알려진 미해결

- 월 전체 예산에 삭제 UI가 없다. 카테고리별 예산에는 있어서 비대칭.
- 이용약관은 아직 없다. 관례적일 뿐 필수는 아니다.
