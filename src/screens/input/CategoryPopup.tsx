import { useLiveQuery } from 'dexie-react-hooks';
import { createPortal } from 'react-dom';
import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import { SubChips } from '../../components/SubChips';
import { loadMemoStats } from '../../db/memoStats';
import type { CategoryRecord } from '../../db/types';
import { useShell } from '../../shell/ShellContext';
import { won } from '../../lib/format';
import { blurOnEnter } from '../../lib/keyboard';
import { suggestMemos } from '../../lib/memoSuggest';
import { useBackHandler } from '../../shell/useBackHandler';
import styles from './CategoryPopup.module.css';

export type PopupOrigin = { dx: number; dy: number };

type Props = {
  category: CategoryRecord;
  origin: PopupOrigin;
  closing: boolean;
  amount: string;
  sub: string | null;
  memo: string;
  onSelectSub: (sub: string) => void;
  onMemoChange: (memo: string) => void;
  /** Stages this category/sub/memo on the screen behind it — does not touch
   *  the database. Only the screen's own "추가!" button does that. */
  onConfirm: () => void;
  onClose: () => void;
};

export function CategoryPopup({
  category,
  origin,
  closing,
  amount,
  sub,
  memo,
  onSelectSub,
  onMemoChange,
  onConfirm,
  onClose,
}: Props) {
  const shell = useShell();
  /* Back cancels the pick rather than confirming it — the popup exists so a
     category can be reviewed and backed out of without touching what the next
     save will use. Registered while the exit animation plays too, which is
     harmless: onClose is idempotent. */
  useBackHandler(true, onClose);

  /* 메모 칸에 커서가 있는 동안. 이때만 키보드가 올라와 있고, 이때만 칩 줄이 보인다. */
  const [typing, setTyping] = useState(false);

  /* 팝업이 뜰 때 한 번 읽는다. 기록을 훑는 값이라 글자를 칠 때마다 다시 읽지 않고,
     걸러내는 건 아래에서 메모리 안에서 한다. 읽는 데 실패하거나 아직 안 왔으면 칩이
     없을 뿐이고, 메모를 직접 적는 데는 영향이 없다. */
  const stats = useLiveQuery(() => loadMemoStats(), []);
  const chips = useMemo(
    () =>
      stats
        ? suggestMemos(stats, { categoryId: category.id, amount: Number(amount) || 0, text: memo })
        : [],
    [stats, category.id, amount, memo],
  );

  if (!shell) return null;

  /* 버튼을 눌러도 메모 칸의 포커스를 뺏지 않는다. 포커스가 빠지면 칩 줄이 사라지고
     팝업이 제자리로 내려오는데, 그 사이에 손가락 밑의 버튼이 움직여서 누른 것이
     엉뚱한 곳에 떨어진다. 키보드는 키보드의 '완료'로 내린다. */
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  // The popup grows out of the icon the user tapped and collapses back into it.
  const originVars = { '--dx': `${origin.dx}px`, '--dy': `${origin.dy}px` } as CSSProperties;

  return createPortal(
    <>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="닫기" />
      <div
        className={`${styles.popup} ${typing ? styles.lifted : ''} ${closing ? styles.closing : ''}`}
        style={originVars}
        role="dialog"
        aria-modal="true"
        aria-label={`${category.name} 기록`}
      >
        <div className={styles.head}>
          <span className={styles.badge} style={{ background: category.colorHex }}>
            <Icon path={category.iconPath} size={26} />
          </span>
          <div>
            <div className={styles.name}>{category.name}</div>
            <div className={styles.amount}>{won(amount || '0')}원</div>
          </div>
        </div>

        <SubChips
          className={styles.subs}
          subs={category.subs}
          selected={sub}
          onPick={onSelectSub}
          onMouseDown={keepFocus}
        />

        <input
          className={styles.memo}
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="메모 (선택)"
          enterKeyHint="done"
          onKeyDown={blurOnEnter}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />

        {/* 칸이 비어 있어도 줄의 높이는 그대로 둔다. 후보가 있다 없다 하는 동안 아래
            '입력 완료'가 위아래로 움직이면 글자를 치다가 버튼을 놓친다. */}
        {typing && (
          <div className={styles.suggest}>
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.suggestChip}
                onMouseDown={keepFocus}
                onClick={() => onMemoChange(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Not a save — this only hands the pick back to the screen. Distinct
            from the screen's own "추가!", which is the one action that
            actually writes a record. */}
        <button type="button" className={styles.cta} onMouseDown={keepFocus} onClick={onConfirm}>
          입력 완료
        </button>
      </div>
    </>,
    shell,
  );
}
