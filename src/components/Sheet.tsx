import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../shell/ShellContext';
import { useBackHandler } from '../shell/useBackHandler';
import styles from './Sheet.module.css';

type Props = {
  onClose: () => void;
  label: string;
  children: ReactNode;
};

/** 이만큼 끌어내리면 닫는다. 스크롤을 하려다 손가락이 미끄러진 정도로는
 *  닫히지 않아야 하고, 닫으려고 마음먹었을 때 두 번 끌게 해서도 안 된다. */
const DISMISS_PX = 80;

/** Bottom sheet with a tap-to-dismiss scrim, a drag-down handle, and the
 *  Android back button.
 *
 *  Claiming the back button here rather than in each caller covers every sheet
 *  in the app at once, and means a new sheet gets the behaviour without anyone
 *  remembering to add it. The handle is here for the same reason.
 *
 *  Why the handle and not the whole sheet: the sheet scrolls its own content,
 *  so a drag started anywhere inside it is ambiguous — scroll or dismiss? —
 *  and getting that judgement slightly wrong reads as "it sometimes doesn't
 *  close". The handle is not a scroll surface, so the question never arises. */
export function Sheet({ onClose, label, children }: Props) {
  const shell = useShell();
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  /* Before the early return, so the hook order stays stable across the render
     where `shell` is still null. */
  useBackHandler(true, onClose);

  const dragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetRef.current?.setAttribute('data-dragging', '');
  };

  const dragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current === null || !sheetRef.current) return;
    // Down only. Dragging a bottom sheet up has nowhere to go.
    const dy = Math.max(0, e.clientY - startY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };

  const dragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current;
    if (startY.current === null || !sheet) return;
    const dy = Math.max(0, e.clientY - startY.current);
    startY.current = null;
    sheet.removeAttribute('data-dragging');

    /* Past the threshold the sheet is about to unmount, so it keeps the
       transform it was dragged to — resetting first would snap it back up for
       one frame before it disappears. */
    if (dy > DISMISS_PX) {
      onClose();
      return;
    }
    sheet.style.transform = '';
  };

  if (!shell) return null;

  return createPortal(
    <>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="닫기" />
      <div ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-label={label}>
        <div
          className={styles.handle}
          onPointerDown={dragStart}
          onPointerMove={dragMove}
          onPointerUp={dragEnd}
          onPointerCancel={dragEnd}
        >
          <span className={styles.grabber} />
        </div>
        {/* 스크롤은 본문만 한다. 손잡이를 스크롤 안에 두면 내용이 긴 시트에서
            같이 밀려 사라지고, 붙여두면 이번엔 내용이 손잡이 밑으로 지나가며
            잘려 보인다. 스크롤 영역 밖에 두면 두 문제가 다 없다. */}
        <div className={styles.body}>{children}</div>
      </div>
    </>,
    shell,
  );
}
