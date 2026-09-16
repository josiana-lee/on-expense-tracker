import { useEffect } from 'react';
import { setHapticsEnabled } from '../lib/haptics';
import { useSettings } from './useSettings';

/** Mirrors settings.hapticsEnabled into the module that the keypad calls.
 *
 *  useTheme와 같은 모양이다 — 설정을 한 곳에서 읽어 앱 바깥(거기서는 문서
 *  루트, 여기서는 진동)으로 밀어준다. 구독이 하나라 설정을 끄면 화면에 떠
 *  있는 숫자판이 몇 개든 다음 탭부터 조용해진다.
 *
 *  기본값은 켜짐. 설정 행이 아직 안 읽힌 첫 프레임에도 켜진 상태로 두는데,
 *  그 사이에 숫자를 누르는 건 사실상 불가능하고 꺼둔 사람에게 한 번 울리는
 *  쪽이 켜둔 사람에게 한 번 빠지는 쪽보다 눈에 띄기 때문이다. */
export function useHaptics(): void {
  const settings = useSettings();
  const on = settings?.hapticsEnabled ?? true;

  useEffect(() => {
    setHapticsEnabled(on);
  }, [on]);
}
