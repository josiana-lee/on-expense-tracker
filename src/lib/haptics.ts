import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** 설정값의 사본. 기본은 켜짐 — 이 설정이 생기기 전에 만들어진 행에는 필드가
 *  없어서, 쓰던 앱을 올린 사람과 새로 깐 사람이 같은 감으로 시작하게 한다.
 *
 *  모듈 변수인 이유는 읽는 쪽이 렌더가 아니라 이벤트 콜백이기 때문이다.
 *  useBackHandler의 스택과 같은 이유로, 여기에 두면 설정이 바뀔 때 아무것도
 *  다시 그리지 않고도 다음 탭부터 맞는 값을 쓴다. Keypad가 직접 설정을 읽게
 *  하면 숫자판 하나하나가 DB를 구독하게 되는데, 숫자 하나 누르는 데 그만한
 *  배선이 필요하지 않다. */
let enabled = true;

/** useHaptics가 설정을 읽어 밀어준다. 부르는 곳은 거기 하나뿐이다. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** 숫자판 한 번 누른 느낌. 가볍게 한 번만 친다.
 *
 *  기다리지 않고 실패도 삼킨다. 진동기가 없는 기기에서 이게 던지면 숫자가
 *  안 눌리는데, 진동은 입력의 곁다리지 조건이 아니다. 웹에서는 플러그인이
 *  navigator.vibrate로 떨어지므로 브라우저에서도 같은 경로를 탄다. */
export function tapFeedback(): void {
  if (!enabled) return;
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
