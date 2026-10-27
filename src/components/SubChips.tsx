import type { MouseEvent } from 'react';
import styles from './SubChips.module.css';

type Props = {
  subs: string[];
  selected: string | null | undefined;
  /** 칩을 눌렀다. 고르기만 할지 눌러서 풀 수도 있게 할지는 부르는 쪽이 정한다. */
  onPick: (sub: string) => void;
  /** 바텀시트 안에서 쓰는 한 단계 작은 크기. 카테고리 팝업은 기본 크기. */
  compact?: boolean;
  /** 줄 바깥 간격처럼 쓰는 곳마다 다른 것만 얹는다. */
  className?: string;
  /** 버튼을 눌러도 다른 칸의 포커스를 뺏지 않게 한다(카테고리 팝업의 메모 칸). */
  onMouseDown?: (e: MouseEvent) => void;
};

/** 세부항목 칩 줄 — 고르기만 한다. 카테고리 팝업(입력 탭), 달력의 추가/수정 시트, 저장해둔 지출 시트가 모두
 *  이걸 쓴다.
 *
 *  세부항목을 만들고 고치고 지우는 건 설정 > 카테고리 관리에서만 한다. 기록하는 화면에 `+`를 두었더니 칩 줄이
 *  매번 편집 도구처럼 보여서 지저분했다 — 기록하는 곳에서는 고르기만 한다. */
export function SubChips({ subs, selected, onPick, compact, className, onMouseDown }: Props) {
  /* 지금 붙어 있는 세부항목이 목록에 없으면(설정에서 지웠거나 이름을 바꿨으면) 그것도 칩으로 보여준다. 안 보이면
     저장해둔 지출처럼 제목이 따로 없는 화면에서는 무엇이 붙어 있는지 알 수 없고, 풀 방법도 없는데 저장할 때마다
     그대로 따라간다. 눌러서 풀 수 있게 끝에 고른 상태로 둔다 — 만들거나 고치는 게 아니라 고르는 것이다. */
  const shown = selected && !subs.includes(selected) ? [...subs, selected] : subs;
  return (
    <div className={`${styles.subs} ${compact ? styles.compact : ''} ${className ?? ''}`}>
      {shown.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          onMouseDown={onMouseDown}
          className={`${styles.sub} ${selected === s ? styles.subOn : ''}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
