import { useRef, useState } from 'react';
import { MAX_SUB_LENGTH } from '../../db/categories';
import { blurOnEnter } from '../../lib/keyboard';
import styles from './SubsEditor.module.css';

type Props = {
  subs: string[];
  onChange: (subs: string[]) => void;
};

/** 카테고리 수정 시트의 세부항목 편집. 세부항목을 만들고 고치고 지우는 곳은 여기 하나다 — 기록하는 화면
 *  (입력 탭·달력)의 칩은 고르기만 한다(components/SubChips).
 *
 *  - 끝의 동그란 `+`를 누르면 그 자리가 입력칸으로 늘어난다(또잉). 이름을 치고 완료를 누르면 칩이 생긴다(뾰잉).
 *  - 칩을 누르면 그 칩이 입력칸이 되어 이름을 고친다. 비우거나 다른 칩과 같은 이름이면 그대로 둔다.
 *  - 칩의 ×는 지운다. 시트의 "수정 완료"를 눌러야 저장되므로, 잘못 지웠으면 시트를 닫으면 된다.
 *
 *  지우거나 이름을 바꿔도 이미 적은 기록의 세부항목 글자는 그대로다 — 기록마다 글자로 들고 있다. */
export function SubsEditor({ subs, onChange }: Props) {
  /** 이름을 치는 칸: 고치는 칩의 순서, 새로 만드는 중이면 'new'. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [text, setText] = useState('');
  /** 방금 생긴 칩 — 한 번 통통 튄다. */
  const [popped, setPopped] = useState<string | null>(null);
  /* 완료를 누르면 blur로 확정하는데, 입력칸이 사라지면서 blur가 한 번 더 올 수 있다. 두 번 반영하지 않는다. */
  const settled = useRef(true);

  const start = (target: number | 'new') => {
    settled.current = false;
    setText(target === 'new' ? '' : subs[target]);
    setEditing(target);
  };

  /* 칸 밖을 눌러 빠져나가도 친 이름은 살린다 — 이름을 치고 "수정 완료"부터 누르는 손이 많은데, 거기서 글자가
     사라지면 칩이 안 생긴 이유를 알 수 없다. */
  const settle = () => {
    if (settled.current) return;
    settled.current = true;
    const name = text.trim().slice(0, MAX_SUB_LENGTH).trim();
    const target = editing;
    setEditing(null);
    setText('');
    if (!name || target === null) return;
    const others = target === 'new' ? subs : subs.filter((_, i) => i !== target);
    if (others.includes(name)) return;
    if (target === 'new') {
      onChange([...subs, name]);
      setPopped(name);
    } else if (subs[target] !== name) {
      onChange(subs.map((s, i) => (i === target ? name : s)));
    }
  };

  const field = (
    <input
      className={`${styles.field} ${editing === 'new' ? styles.fieldGrow : ''}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={settle}
      onKeyDown={blurOnEnter}
      maxLength={MAX_SUB_LENGTH}
      placeholder="새 세부항목"
      aria-label={editing === 'new' ? '새 세부항목 이름' : '세부항목 이름 고치기'}
      enterKeyHint="done"
      autoFocus
    />
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>세부항목</div>
      <div className={styles.chips}>
        {subs.map((s, i) =>
          editing === i ? (
            <span key={s}>{field}</span>
          ) : (
            <span key={s} className={`${styles.chip} ${popped === s ? styles.pop : ''}`}>
              <button type="button" className={styles.chipName} onClick={() => start(i)} aria-label={`${s} 이름 고치기`}>
                {s}
              </button>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onChange(subs.filter((_, j) => j !== i))}
                aria-label={`${s} 지우기`}
              >
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ),
        )}
        {editing === 'new' ? (
          field
        ) : (
          <button type="button" className={styles.add} onClick={() => start('new')} aria-label="세부항목 추가">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      <p className={styles.hint}>지우거나 이름을 바꿔도 이미 적은 기록은 그대로예요.</p>
    </div>
  );
}
