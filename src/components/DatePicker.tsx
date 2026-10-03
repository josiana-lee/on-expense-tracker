import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { monthGrid, parseDateStr } from '../db/date';
import type { DateStr } from '../db/types';
import { useSettings } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { useBackHandler } from '../shell/useBackHandler';
import styles from './DatePicker.module.css';

const CHEVRON_LEFT = 'M15 5l-7 7 7 7';
const CHEVRON_RIGHT = 'M9 5l7 7-7 7';
const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  /** 지금 골라져 있는 날짜. 이 달을 펼친 채로 열린다. */
  value: DateStr;
  onPick: (date: DateStr) => void;
  onClose: () => void;
};

/** 날짜 필 아래에 붙는 달력.
 *
 *  `<input type="date">`의 네이티브 다이얼로그를 대신한다. 그쪽은 OS가 칠하는
 *  화면이라 CSS가 닿지 않아서, 동글동글한 앱 한가운데에 각진 초록색 사각형이
 *  떴다 — 게다가 시트 위에 또 창이 뜨는 모양이었다.
 *
 *  생김새는 새로 만들지 않고 달력 탭에서 그대로 가져왔다. 오늘은 숫자 밑줄,
 *  고른 날은 연보라 채움, 일요일은 붉은 글자. 달력 탭에서 그 신호를 한 번 배운
 *  사람은 여기서 다시 배울 게 없다. 격자도 같은 monthGrid를 쓰므로 주 시작요일
 *  설정이 두 화면에서 어긋나지 않는다. */
export function DatePicker({ value, onPick, onClose }: Props) {
  const settings = useSettings();
  const weekStartDay = settings?.weekStartDay ?? 0;
  const today = useToday();

  /* 뒤로가기는 시트가 아니라 이 달력이 먼저 받는다. 스택의 맨 위가 가져가므로
     나중에 열린 쪽이 이긴다 — 한 번 누르면 달력만 닫히고 기록은 열려 있다. */
  useBackHandler(true, onClose);

  const opened = parseDateStr(value);
  const [view, setView] = useState({
    year: opened.getFullYear(),
    month: opened.getMonth() + 1,
  });

  const { dows, cells } = useMemo(
    () => monthGrid(view.year, view.month, weekStartDay),
    [view, weekStartDay],
  );

  /* 좁은 화면에서 오른쪽으로 넘치면 안쪽으로 당긴다. 달력은 날짜 필에
     매달려 있는데, 필이 제목 옆이라 화면 왼쪽에서 한참 들어와 있다 — 320px
     기기에서는 282px짜리 달력이 그대로 화면 밖으로 나간다.
     미는 건 transform이 아니라 margin이다. 여는 애니메이션이 transform을
     쓰고 있어서 둘이 같은 속성을 두고 다툰다 — CategoryPopup이 가운데
     정렬에서 이미 겪고 주석으로 남겨둔 함정이다.
     꼭지는 같이 밀지 않는다. 상자만 움직이고 꼭지는 필 밑에 남아야
     어디서 나온 달력인지가 유지된다. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const over = el.getBoundingClientRect().right - (window.innerWidth - 12);
    if (over > 0) setShift(-over);
  }, []);

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const todayKey = useMemo(() => {
    const t = today;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }, [today]);

  return (
    <>
      {/* 바깥을 누르면 닫힌다. 어둡게 덮지는 않는다 — 고치던 기록이 뒤에
          그대로 보여야 어느 날짜를 고르는 중인지 알 수 있고, 달력이 그 위에
          떠 있다는 것도 그림자만으로 충분히 읽힌다. */}
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="닫기" />

      <div
        ref={boxRef}
        className={styles.popover}
        style={shift ? { marginLeft: shift } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="날짜 선택"
      >
        <span className={styles.tail} style={{ left: 24 - shift }} aria-hidden="true" />

        <div className={styles.head}>
          <button type="button" className={styles.nav} onClick={() => shiftMonth(-1)} aria-label="이전 달">
            <Icon path={CHEVRON_LEFT} size={16} stroke="currentColor" strokeWidth={2.4} />
          </button>
          <span className={styles.title}>
            {view.year}년 {view.month}월
          </span>
          <button type="button" className={styles.nav} onClick={() => shiftMonth(1)} aria-label="다음 달">
            <Icon path={CHEVRON_RIGHT} size={16} stroke="currentColor" strokeWidth={2.4} />
          </button>
        </div>

        <div className={styles.dows}>
          {dows.map((d) => (
            <div key={d} className={`${styles.dow} ${d === 0 ? styles.sunday : ''}`}>
              {DOW_NAMES[d]}
            </div>
          ))}
        </div>

        <div className={styles.days}>
          {cells.map(({ key, date }) =>
            date === null ? (
              <span key={key} className={styles.blank} />
            ) : (
              <button
                key={key}
                type="button"
                className={[
                  styles.day,
                  date.dateKey === value ? styles.selected : '',
                  date.dateKey === todayKey ? styles.today : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                /* 고르는 즉시 닫는다. 확인 버튼을 두면 날짜 하나 고치는 데
                   탭이 두 번이 되는데, 이건 잘못 적힌 날짜를 바로잡는
                   예외 경로라 짧을수록 좋다. */
                onClick={() => {
                  onPick(date.dateKey);
                  onClose();
                }}
                aria-label={`${view.year}년 ${view.month}월 ${date.n}일`}
                aria-current={date.dateKey === value ? 'date' : undefined}
              >
                <span className={`${styles.dayNum} ${date.dow === 0 ? styles.sundayNum : ''}`}>
                  {date.n}
                </span>
              </button>
            ),
          )}
        </div>
      </div>
    </>
  );
}
