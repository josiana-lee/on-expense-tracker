import { currencyOf } from '../lib/currency';
import { amountSize, won } from '../lib/format';
import { ClearAmount } from './ClearAmount';
import { ForeignPanel } from './ForeignPanel';
import { Keypad } from './Keypad';
import { Sheet } from './Sheet';
import { useForeignEntry } from './useForeignEntry';
import styles from './ForeignAmountSheet.module.css';

type Props = {
  /** 바깥 시트의 원화 금액("18552"). 환산한 값이 여기로 계속 들어간다. */
  amount: string;
  /** 설정의 환율 자동 조회: true 허용, false 직접 입력만, undefined 아직 안 물어봄. */
  fxLookup: boolean | undefined;
  onAmount: (amount: string) => void;
  onClose: () => void;
};

/** 해외 결제 금액만 치는 시트. 달력의 "기록 추가"처럼 이미 꽉 찬 시트에서 위로 열린다.
 *
 *  입력 탭의 금액 시트는 키패드가 시트의 주인이라 환율 줄을 같이 놓을 자리가 있다. 기록 추가
 *  시트는 카테고리·세부항목·메모·결제수단·숫자판이 이미 700px 화면의 87%를 쓰고 있어서, 거기에
 *  칩과 환율 줄을 펼치면 숫자판이 화면 밖으로 밀린다. 그래서 눌러야 열리는 별도 시트로 뒀다.
 *  **보이는 모습은 입력 탭과 같은 부품**(`ForeignPanel`, `useForeignEntry`)이라 한쪽을 고치면
 *  다른 쪽도 같이 바뀐다.
 *
 *  환산한 원화는 치는 즉시 바깥 금액에 들어간다. `완료`는 닫기일 뿐이라 닫는 방법(완료, 배경,
 *  뒤로 가기)에 따라 결과가 달라지지 않는다. */
export function ForeignAmountSheet({ amount, fxLookup, onAmount, onClose }: Props) {
  const fx = useForeignEntry({ open: true, fxLookup, onAmount });

  return (
    <Sheet label="해외 결제 금액" onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.label}>해외 결제</span>
        <span className={`${styles.value} tabular`} data-size={amountSize(amount)}>
          {won(amount || '0')}원
        </span>
        {amount && <ClearAmount onClear={fx.clear} />}
      </div>

      <ForeignPanel
        standalone
        expanded
        onExpand={fx.expand}
        entry={fx.entry}
        status={fx.status}
        krwPer={fx.krwPer}
        fetched={fx.fetched}
        amount={amount}
        onPick={fx.pickCurrency}
        onEditRate={fx.editRate}
        onDoneRate={fx.doneRate}
        onAllow={fx.allow}
        onDeny={fx.deny}
      />

      <Keypad
        dot={fx.entry.editing === 'rate' || (fx.entry.code !== null && currencyOf(fx.entry.code).decimals > 0)}
        onPress={(k) => fx.press(k)}
      />
      <button type="button" className={styles.done} onClick={onClose}>
        완료
      </button>
    </Sheet>
  );
}
