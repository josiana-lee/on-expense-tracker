import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { parseDateStr } from '../../db/date';
import type { ExpenseRecord } from '../../db/types';
import { useAllExpenses } from '../../hooks/useAllExpenses';
import { useCatalog } from '../../hooks/useCatalog';
import { shortDate, won } from '../../lib/format';
import { useBackHandler } from '../../shell/useBackHandler';
import styles from './SearchScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
const SEARCH_ICON = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35';
const CLOSE_ICON = 'M6 6l12 12M18 6L6 18';

/** 한 번에 그리는 검색 결과 수. */
const SHOWN_LIMIT = 100;

type Props = {
  onBack: () => void;
  onSelectRecord: (record: ExpenseRecord) => void;
};

export function SearchScreen({ onBack, onSelectRecord }: Props) {
  useBackHandler(true, onBack);
  const [query, setQuery] = useState('');
  const { records } = useAllExpenses();
  const { byId, paymentById } = useCatalog();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return records.filter((r) => {
      const catName = byId.get(r.categoryId)?.name ?? '';
      return (
        r.memo?.toLowerCase().includes(q) ||
        r.subLabel?.toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q)
      );
    });
  }, [records, query, byId]);

  /* 화면에 그리는 건 앞의 일부뿐이다. 비용이 걸리는 곳은 거르는 계산이
     아니라 DOM이다 — 기록 5,000건에서 "점"을 검색하면 2,500건이 걸리고
     행마다 10개씩, 노드 26,000개가 한 번에 만들어져 렌더러가 멈춘다.
     거르는 계산 자체는 그 상태에서도 수 ms다.

     한글은 이걸 앞당긴다. "점심"을 치면 ㅈ → 저 → 점 → 점ㅅ → 점시 → 점심
     순으로 입력이 들어와서, 최종 검색어가 좁아도 가장 넓은 중간 단계를
     반드시 지나간다. 사용자는 늘 제일 비싼 순간을 먼저 만난다.

     가상 스크롤 대신 상한을 둔 이유: 상한이면 이 문제가 사라지고, 가상
     스크롤은 의존성과 함께 스크롤 위치·포커스·접근성 처리를 새로 안고 온다.
     찾는 기록이 100건 밖에 있다면 필요한 건 더 긴 목록이 아니라 더 좁은
     검색어다. */
  const shown = useMemo(() => results.slice(0, SHOWN_LIMIT), [results]);

  return (
    <div className={styles.sub}>
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <div className={styles.inputWrap}>
          <Icon path={SEARCH_ICON} size={17} stroke="var(--tx2)" strokeWidth={2.2} />
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모, 항목, 카테고리로 검색"
            enterKeyHint="search"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
            >
              <Icon path={CLOSE_ICON} size={13} stroke="currentColor" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {!query.trim() ? (
          <p className={styles.hint}>
            메모, 세부항목, 카테고리 이름으로
            <br />
            지난 기록을 찾아볼 수 있어
          </p>
        ) : results.length === 0 ? (
          <p className={styles.hint}>검색 결과가 없어.</p>
        ) : (
          <>
            <div className={styles.count}>
              {results.length}건
              {results.length > SHOWN_LIMIT && ` 중 ${SHOWN_LIMIT}건`}
            </div>
            <div className={styles.resultCard}>
              {shown.map((r) => {
                const cat = byId.get(r.categoryId);
                const pay = paymentById.get(r.paymentMethodId);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={styles.row}
                    onClick={() => onSelectRecord(r)}
                  >
                    <span className={styles.rowBadge} style={{ background: cat?.colorHex }}>
                      {cat && <Icon path={cat.iconPath} size={19} strokeWidth={1.8} />}
                    </span>
                    <div className={styles.rowMain}>
                      <div className={styles.rowName}>{r.subLabel || cat?.name}</div>
                      <div className={styles.rowSub}>
                        {[r.memo, r.subLabel ? cat?.name : null, pay?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className={styles.rowRight}>
                      <div className={`${styles.rowAmount} tabular`}>{won(r.amount)}원</div>
                      <div className={styles.rowDate}>
                        {shortDate(parseDateStr(r.date))} · {r.time}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {results.length > SHOWN_LIMIT && (
              <p className={styles.more}>검색어를 조금 더 좁히면 찾는 걸 빨리 볼 수 있어</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
