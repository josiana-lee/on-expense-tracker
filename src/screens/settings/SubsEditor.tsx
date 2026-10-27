import { useRef, useState, type MouseEvent } from 'react';
import { MAX_SUB_LENGTH } from '../../db/categories';
import { blurOnEnter } from '../../lib/keyboard';
import styles from './SubsEditor.module.css';

type Props = {
  subs: string[];
  onChange: (subs: string[]) => void;
  /** 이미 있는 카테고리를 고치는 중인가. 새로 만들 때는 "이미 적은 기록" 안내가 맞지 않아서 숨긴다. */
  existing: boolean;
};

const clean = (raw: string) => raw.trim().slice(0, MAX_SUB_LENGTH).trim();

/** 카테고리 수정 시트의 세부항목 편집. 세부항목을 만들고 고치고 지우는 곳은 여기 하나다 — 기록하는 화면
 *  (입력 탭·달력)의 칩은 고르기만 한다(components/SubChips).
 *
 *  - 끝의 동그란 `+`를 누르면 그 자리가 입력칸으로 늘어난다(또잉). 이름을 치고 완료를 누르면 칩이 생긴다(뾰잉).
 *  - 칩을 누르면 그 칩이 입력칸이 되어 이름을 고친다. 비우면 그대로 둔다.
 *  - 이미 있는 이름이면 새로 만들지 않고 그 칩이 한 번 튄다 — 여기 있다고 알려준다.
 *  - 칩의 ×는 지운다. 시트의 "수정 완료"를 눌러야 저장되므로, 잘못 지웠으면 시트를 닫으면 된다.
 *
 *  지우거나 이름을 바꿔도 이미 적은 기록의 세부항목 글자는 그대로다 — 기록마다 글자로 들고 있다. */
export function SubsEditor({ subs, onChange, existing }: Props) {
  /** 이름을 치는 칸: 고치는 칩의 순서, 새로 만드는 중이면 'new'. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [text, setText] = useState('');
  /** 한 번 튈 칩. n이 바뀌면 칩이 새로 그려져서 같은 칩도 다시 튄다. */
  const [pop, setPop] = useState<{ name: string; n: number } | null>(null);
  const bump = (name: string) => setPop((p) => ({ name, n: (p?.n ?? 0) + 1 }));
  /* 입력칸이 열려 있는가 — 렌더를 기다리지 않는 표시. 버튼 동작 안에서 입력칸을 닫으면 그 뒤에 blur가 한 번 더
     올 수 있는데, 그때의 핸들러는 닫히기 전 목록을 들고 있어서 방금 지운 칩을 되살린다. 이 표시로 막는다. */
  const openRef = useRef(false);

  /** 열려 있는 입력칸의 글자를 반영한 목록. 같은 이름이 있으면 그 칩을 튀게 하고 목록은 그대로다. */
  const applyPending = (): string[] => {
    if (editing === null) return subs;
    const name = clean(text);
    if (!name) return subs;
    const clashes = subs.some((s, i) => s === name && i !== editing);
    if (clashes) {
      bump(name);
      return subs;
    }
    if (editing === 'new') {
      bump(name);
      return [...subs, name];
    }
    return subs.map((s, i) => (i === editing ? name : s));
  };

  const close = () => {
    openRef.current = false;
    setEditing(null);
    setText('');
  };

  /** 입력칸을 닫으며 친 글자를 반영하고, 반영된 목록을 돌려준다. */
  const commit = (): string[] => {
    const next = applyPending();
    close();
    if (next !== subs) onChange(next);
    return next;
  };

  const start = (target: number | 'new', initial: string) => {
    openRef.current = true;
    setText(initial);
    setEditing(target);
  };

  /* 입력칸이 열린 채 다른 칩·×·+를 누를 때, 입력칸이 포커스를 잃으면 그 순간 칩으로 줄어들어 옆 버튼들이 밀린다.
     그러면 손가락을 뗀 자리에 다른 버튼이 와 있어서 누른 게 무시되거나 옆 칩이 지워진다. 누르는 순간에는
     포커스를 붙잡아 두고(자리가 그대로), 버튼의 동작 안에서 입력을 반영한 뒤 처리한다. */
  const hold = (e: MouseEvent) => {
    if (openRef.current) e.preventDefault();
  };

  const field = (
    <input
      className={`${styles.field} ${editing === 'new' ? styles.fieldGrow : ''}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      /* 칸 밖을 눌러 빠져나가도 친 이름은 살린다 — 이름을 치고 "수정 완료"부터 누르는 손이 많다. */
      onBlur={() => {
        if (openRef.current) commit();
      }}
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
            <span
              key={pop?.name === s ? `${s}-${pop.n}` : s}
              className={`${styles.chip} ${pop?.name === s ? styles.pop : ''}`}
            >
              <button
                type="button"
                className={styles.chipName}
                onMouseDown={hold}
                onClick={() => {
                  const next = commit();
                  const at = next.indexOf(s);
                  if (at >= 0) start(at, s);
                }}
                aria-label={`${s} 이름 고치기`}
              >
                {s}
              </button>
              <button
                type="button"
                className={styles.remove}
                onMouseDown={hold}
                onClick={() => {
                  const next = commit();
                  onChange(next.filter((x) => x !== s));
                }}
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
          <button
            type="button"
            className={styles.add}
            onMouseDown={hold}
            onClick={() => {
              commit();
              start('new', '');
            }}
            aria-label="세부항목 추가"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      {existing && <p className={styles.hint}>지우거나 이름을 바꿔도 이미 적은 기록은 그대로야.</p>}
    </div>
  );
}
