import { CURRENCIES, currencyOf, formatForeign, rateLine } from '../../lib/currency';
import type { ForeignEntry } from '../../lib/foreignEntry';
import { describeAge, type FxRates } from '../../lib/fxRates';
import { won } from '../../lib/format';
import type { RateStatus } from './useForeignEntry';
import styles from './ForeignPanel.module.css';

type Props = {
  /** 통화 칩 줄이 펼쳐졌는가. 아니면 "해외 결제 금액 입력" 버튼 하나만 보인다. */
  expanded: boolean;
  onExpand: () => void;
  entry: ForeignEntry;
  status: RateStatus;
  /** 지금 쓰는 환율(1단위가 몇 원인가). */
  krwPer: number | null;
  /** 받아 온 환율 묶음 — 얼마나 묵었는지 말할 때 쓴다. */
  fetched: FxRates | null;
  /** 바깥 금액 카드의 원화 금액("18552"). 환산한 결과를 여기서 읽어 보여준다. */
  amount: string;
  onPick: (code: ForeignEntry['code']) => void;
  onEditRate: () => void;
  onDoneRate: () => void;
  onAllow: () => void;
  onDeny: () => void;
};

/** 금액 시트의 통화 칩과 환율 줄.
 *
 *  칩은 한 줄로 옆으로 밀어 본다 — 두 줄로 접으면 키패드가 밀려나고, 이 시트에서 제일 중요한 건
 *  여전히 숫자판이다. 맨 앞 "원"이 기본이고 외화를 고르면 그 아래에 환율 줄이 나온다. */
export function ForeignPanel({
  expanded,
  onExpand,
  entry,
  status,
  krwPer,
  fetched,
  amount,
  onPick,
  onEditRate,
  onDoneRate,
  onAllow,
  onDeny,
}: Props) {
  const cur = entry.code ? currencyOf(entry.code) : null;

  /* 평소 모습: 버튼 하나. 외화를 쓰는 날은 드물어서 칩 아홉 개가 늘 보이면 이 시트가 "원화 숫자판"이
     아니라 "환전소"처럼 보인다. 눌러야 칩이 나오고, 칩 줄의 "원"이 다시 접는 길이다. */
  if (!expanded) {
    return (
      <div className={styles.panel}>
        <button type="button" className={styles.expand} onClick={onExpand}>
          해외 결제 금액 입력
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.chips} role="group" aria-label="통화">
        <button
          type="button"
          className={`${styles.chip} ${entry.code === null ? styles.chipOn : ''}`}
          aria-pressed={entry.code === null}
          onClick={() => onPick(null)}
        >
          원
        </button>
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`${styles.chip} ${entry.code === c.code ? styles.chipOn : ''}`}
            aria-pressed={entry.code === c.code}
            aria-label={`${c.name} ${c.code}`}
            onClick={() => onPick(c.code)}
          >
            {c.code}
          </button>
        ))}
      </div>

      {cur && status !== 'ask' && (
        <div className={styles.line}>
          <span className={`${styles.krw} tabular`}>
            {entry.text === ''
              ? `${cur.code} 금액을 쳐 주세요`
              : krwPer === null
                ? `${formatForeign(entry.text)} ${cur.code}` // 환율을 모르면 원화를 말하지 않는다("≈ 0원"은 거짓이다)
                : `${formatForeign(entry.text)} ${cur.code} ≈ ${won(amount || '0')}원`}
          </span>
        </div>
      )}

      {status === 'ask' && cur && (
        <div className={styles.ask}>
          <p className={styles.askText}>
            환율을 받으려면 인터넷에 접속해요. 가계부 기록은 보내지 않고, 하루에 한 번만 받아요.
          </p>
          <div className={styles.askButtons}>
            <button type="button" className={styles.askPrimary} onClick={onAllow}>
              환율 받아오기
            </button>
            <button type="button" className={styles.askSecondary} onClick={onDeny}>
              직접 입력할래요
            </button>
          </div>
        </div>
      )}

      {cur && (status === 'ready' || status === 'stale') && krwPer !== null && (
        <div className={styles.rate}>
          <span className={`${styles.rateText} ${status === 'stale' ? styles.stale : ''}`}>
            {rateLine(cur.code, krwPer)}
            {status === 'stale' && fetched ? ` · ${describeAge(fetched, Date.now())} 환율` : ''}
          </span>
          <button type="button" className={styles.fix} onClick={onEditRate}>
            환율 고치기
          </button>
        </div>
      )}

      {cur && status === 'loading' && <div className={styles.rate}>환율 받는 중…</div>}

      {cur && status === 'norate' && (
        <div className={styles.rate}>
          <span className={styles.stale}>환율을 알 수 없어요</span>
          <button type="button" className={styles.fix} onClick={onEditRate}>
            환율 직접 입력
          </button>
        </div>
      )}

      {cur && status === 'editing' && (
        <div className={styles.rate}>
          <span className={`${styles.rateEdit} tabular`}>
            {cur.quoteUnit} {cur.code} = <b>{formatForeign(entry.rateText ?? '')}</b>원
          </span>
          <button type="button" className={styles.fix} onClick={onDoneRate}>
            완료
          </button>
        </div>
      )}

      {cur && (status === 'ready' || status === 'stale') && fetched && entry.rateText === null && (
        <a
          className={styles.credit}
          href="https://www.exchangerate-api.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Rates By Exchange Rate API
        </a>
      )}
    </div>
  );
}
