import { Fragment } from 'react';
import type { RowText } from '../lib/rowText';
import styles from './RowDetail.module.css';

/** 목록 한 줄의 아래 줄. 규칙은 lib/rowText.ts에 있고 여기는 그리기만 한다.
 *
 *  카테고리는 굵게, 그 뒤 세부항목은 "›"로 이어 보통 굵기로 — "어디에 속한 무엇인지"가
 *  한눈에 보이게. 덩어리 사이는 "·"다. */
export function RowDetail({ text }: { text: RowText }) {
  return (
    <>
      {text.detail.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {c.kind === 'category' ? (
            <>
              <b className={styles.category}>{c.category}</b>
              {c.sub && ` › ${c.sub}`}
            </>
          ) : (
            c.text
          )}
        </Fragment>
      ))}
    </>
  );
}
