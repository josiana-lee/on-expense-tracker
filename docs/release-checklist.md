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

## 2. 빌드 환경 — **직접 해야 함**

이 기계에 **JDK가 없다.** 안드로이드 프로젝트 생성까지는 끝났지만 컴파일은
아직 한 번도 못 했다.

- [ ] JDK 21 설치 (예: `brew install --cask temurin@21`)
- [ ] `./gradlew assembleDebug`가 통과하는지 확인

  ```bash
  cd android && ./gradlew assembleDebug
  ```

Android SDK는 `~/Library/Android/sdk`에 이미 있다. Android Studio는 없지만
커맨드라인 빌드에는 필요 없다.

## 3. 네이티브 기능 교체 — 아직 안 함

지금 앱은 WebView 안에서 브라우저 API를 그대로 쓴다. 세 곳이 네이티브
플러그인으로 바뀌어야 제대로 동작한다.

- [ ] `lib/download.ts` — `<a download>` / `navigator.share` → Filesystem + Share
- [ ] `hooks/useReminderScheduler.ts` — `Notification` → LocalNotifications
- [ ] 알림이 네이티브로 바뀌면 설정 화면의 "앱이 완전히 꺼져 있으면 알림이 안 울릴 수 있어" 안내문 삭제
- [ ] `db/seed.ts`의 `navigator.storage.persist()`는 WebView에서 의미가 없어졌는지 확인

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

- [ ] `src/data/appInfo.ts`의 `version`
- [ ] `db/backup.ts`의 `APP_VERSION` (백업 파일에 찍힌다 — 위와 같이 움직여야 함)
- [ ] `android/app/build.gradle`의 `versionCode`(정수, 매번 증가) / `versionName`
- [ ] `pnpm build && npx cap sync android`
- [ ] 브랜드 자산을 건드렸다면 `pnpm android:icons`

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
