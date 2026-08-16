import { useEffect, useState } from 'react';
import { fmt } from '../db/date';

/** 오늘 날짜. 날짜가 실제로 바뀔 때만 새 값을 낸다.
 *
 *  달력·예산·자산은 '오늘'을 `useMemo(() => new Date(), [])`로 마운트 시점에
 *  고정하고 있었다. 안드로이드는 앱을 백그라운드로 보내도 페이지를 살려두기
 *  때문에, 밤에 앱을 닫았다가 다음 날 다시 열면 달력의 오늘 표시와 예산의
 *  "하루 N원 쓸 수 있어"가 어제 기준으로 남아 있었다. 월 시작일을 넘기는
 *  날이면 예산 화면이 통째로 지난달을 보여준다.
 *
 *  시각이 아니라 날짜만 보는 이유: 이 화면들은 today의 시/분을 한 번도 쓰지
 *  않는다. `useNow`처럼 분마다 새 값을 내면 하루에 1,440번 리렌더하면서
 *  바뀌는 건 아무것도 없다. 날짜가 같으면 이전 객체를 그대로 돌려주므로
 *  React가 리렌더를 건너뛴다. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;

    const sync = () => {
      setToday((prev) => (fmt(prev) === fmt(new Date()) ? prev : new Date()));
    };

    /* 매번 다음 자정까지를 새로 계산한다. 24시간 간격으로 반복하면 기기
       시계가 조정되거나 서머타임이 있는 지역에서 조금씩 어긋난다. */
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      timer = window.setTimeout(() => {
        sync();
        scheduleMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnight();

    /* 실제로 이 버그가 드러나는 경로. 백그라운드에서는 타이머가 눌리거나
       멈추므로 자정 타이머만으로는 부족하고, 돌아왔을 때 확인해야 한다. */
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
