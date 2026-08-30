import { useMemo } from 'react';
import { INSTALLMENT_MONTHS, splitInstallment } from '../db/installments';
import { won } from '../lib/format';
import styles from './InstallmentPicker.module.css';

type Props = {
  /** 1이면 일시불. */
  months: number;
  onChange: (months: number) => void;
  /** 입력 중인 금액 문자열. 빈 값이면 안내만 띄운다. */
  amount: string;
};

/** 할부 개월 수 칩 + 회차가 어떻게 쪼개지는지 미리보기.
 *
 *  입력 탭과 달력의 기록 추가가 같은 것을 쓴다. 두 곳에 각각 두면 한쪽에만
 *  개월 수가 추가되거나 문구가 갈리는 일이 반드시 생긴다.
 *
 *  신용카드일 때만 보여줄지는 부르는 쪽이 정한다 — 결제수단을 고르는 방식이
 *  두 화면에서 다르다. */
export function InstallmentPicker({ months, onChange, amount }: Props) {
  /** 저장을 누르기 전에 회차가 어떻게 쪼개지는지 보여준다. 나눠 담긴 결과를
   *  나중에 달력에서 처음 보게 되면, 사용자는 앱이 금액을 틀리게 적었다고
   *  읽는다. */
  const preview = useMemo(() => {
    if (months < 2) return null;
    if (!amount) return { kind: 'empty' as const };
    try {
      const parts = splitInstallment(Number(amount), months);
      return { kind: 'ok' as const, first: parts[0], rest: parts[1], even: parts[0] === parts[1] };
    } catch (e) {
      return { kind: 'error' as const, message: (e as Error).message };
    }
  }, [amount, months]);

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.chip} ${months === 1 ? styles.chipOn : ''}`}
          onClick={() => onChange(1)}
        >
          일시불
        </button>
        {INSTALLMENT_MONTHS.map((m) => (
          <button
            key={m}
            type="button"
            className={`${styles.chip} ${months === m ? styles.chipOn : ''}`}
            onClick={() => onChange(m)}
          >
            {m}개월
          </button>
        ))}
      </div>
      {preview && (
        <p className={`${styles.note} ${preview.kind === 'error' ? styles.noteBad : ''}`}>
          {preview.kind === 'empty'
            ? '금액을 넣으면 회차가 어떻게 나뉘는지 보여줄게'
            : preview.kind === 'error'
              ? preview.message
              : preview.even
                ? `매월 ${won(preview.rest)}원씩 ${months}번 기록돼`
                : `첫 달 ${won(preview.first)}원, 이후 ${won(preview.rest)}원씩 기록돼`}
        </p>
      )}
    </div>
  );
}
