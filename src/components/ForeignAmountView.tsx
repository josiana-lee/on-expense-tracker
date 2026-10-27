import { useBackHandler } from '../shell/useBackHandler';
import { currencyOf } from '../lib/currency';
import { amountSize, won } from '../lib/format';
import { ClearAmount } from './ClearAmount';
import { ForeignPanel } from './ForeignPanel';
import { Keypad } from './Keypad';
import { useForeignEntry } from './useForeignEntry';
import styles from './ForeignAmountView.module.css';

type Props = {
  /** 바깥(기록 추가 시트)의 원화 금액("18552"). 환산한 값이 여기로 계속 들어간다. */
  amount: string;
  /** 설정의 환율 자동 조회: true 허용, false 직접 입력만, undefined 아직 안 물어봄. */
  fxLookup: boolean | undefined;
  onAmount: (amount: string) => void;
  /** 해외 결제 입력을 마치고 원래 화면으로 돌아간다. */
  onDone: () => void;
};

/** 기록 추가 시트의 본문을 **그 자리에서** 바꿔 끼우는 해외 결제 금액 입력 화면.
 *
 *  전에는 이걸 별도 시트로 위에 겹쳐 열었는데, 바텀시트 위에 바텀시트가 또 올라오는 모양이 어색했다.
 *  지금은 시트가 하나뿐이고 제목줄(날짜)은 그대로, 아래 본문만 이 화면으로 바뀐다. 기록 추가
 *  시트는 카테고리·세부항목·메모·결제수단·숫자판이 이미 700px 화면의 87%를 쓰고 있어서 칩과 환율 줄을
 *  본문에 그대로 펼칠 수는 없는데, 본문을 통째로 바꾸면 이 화면이 그 자리를 쓰므로 높이가 늘지 않는다.
 *
 *  **보이는 모습은 입력 탭과 같은 부품**(`ForeignPanel`, `useForeignEntry`)이다.
 *  환산한 원화는 치는 즉시 바깥 금액에 들어가므로 `완료`는 돌아가는 일일 뿐이다.
 *  뒤로 가기는 시트 전체가 아니라 이 화면만 닫는다. */
export function ForeignAmountView({ amount, fxLookup, onAmount, onDone }: Props) {
  const fx = useForeignEntry({ open: true, fxLookup, onAmount });
  useBackHandler(true, onDone);

  return (
    <div>
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
        /* 환율을 받을지 답하기 전에는 숫자를 칠 수 없다. */
        disabled={fx.status === 'ask'}
      />
      <button type="button" className={styles.done} onClick={onDone}>
        완료
      </button>
    </div>
  );
}
