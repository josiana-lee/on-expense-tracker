import { uuidv7 } from '../id';
import type { ID, Minor } from '../types';
import type { ImportRow } from './types';

/** 할부가 붙은 행. 묶인 것만 세 필드를 갖는다. */
export type GroupedRow = ImportRow & {
  installmentId?: ID;
  installmentNo?: number;
  installmentMonths?: number;
  installmentTotal?: Minor;
};

const MIN_MONTHS = 2;

/** 흩어진 할부 회차를 묶음으로 되돌린다.
 *
 *  가계부 앱들은 할부를 회차마다 한 줄씩 적는다 — 우리와 같은 방식이다.
 *  내보낸 파일에는 그 줄들이 "이어폰(1/3)" 처럼 글자로만 묶여 있어서,
 *  그대로 넣으면 달력에 똑같은 지출이 세 달에 걸쳐 따로 뜬다. 합계는 맞지만
 *  할부로는 안 보인다.
 *
 *  **완전한 묶음만 되돌린다.** 회차가 하나라도 비면 손대지 않고 개별 지출로
 *  둔다. 반쪽짜리 할부는 달력에 "3개월 할부 1/3"과 "3/3"만 남아 사용자가 읽을
 *  수 없고, 그건 개별 지출 세 건보다 나쁘다. 내보내기 기간을 잘라 받았거나
 *  중간 회차를 지운 사람에게 실제로 일어나는 일이다.
 *
 *  금액은 원본 값을 그대로 쓴다. splitInstallment로 다시 나누지 않는 이유는
 *  나머지를 얹는 방식이 앱마다 달라서, 다시 나누면 1원씩 어긋나며 그러면
 *  사용자의 카드 명세와 안 맞기 때문이다. 총액은 회차 합으로 구한다. */
export function groupInstallments(rows: ImportRow[]): GroupedRow[] {
  const out: GroupedRow[] = rows.map((r) => ({ ...r }));

  // 묶음 키별로 모은다. 인덱스를 들고 다녀야 원래 순서를 안 흔든다.
  const buckets = new Map<string, number[]>();
  out.forEach((r, i) => {
    const inst = r.installment;
    if (!inst || inst.months < MIN_MONTHS) return;
    const list = buckets.get(inst.groupKey);
    if (list) list.push(i);
    else buckets.set(inst.groupKey, [i]);
  });

  for (const [, idx] of buckets) {
    /* 날짜 순으로 본다. 같은 이름·같은 카드로 같은 개월 수의 할부를 두 번
       건 사람이 있으면 한 키에 1,1,2,2가 들어오는데, 회차 1을 만날 때마다
       새 묶음을 시작하면 갈린다. */
    idx.sort((a, b) => (out[a].date < out[b].date ? -1 : out[a].date > out[b].date ? 1 : 0));

    let run: number[] = [];
    const close = () => {
      if (run.length === 0) return;
      const months = out[run[0]].installment!.months;
      // 1..m이 다 모였을 때만. 아니면 손대지 않는다.
      if (run.length === months) {
        const id = uuidv7();
        const total = run.reduce((sum, i) => sum + out[i].amount, 0) as Minor;
        for (const i of run) {
          out[i].installmentId = id;
          out[i].installmentNo = out[i].installment!.no;
          out[i].installmentMonths = months;
          out[i].installmentTotal = total;
        }
      }
      run = [];
    };

    for (const i of idx) {
      const no = out[i].installment!.no;
      if (no === 1) {
        close();
        run = [i];
      } else if (run.length > 0 && no === out[run[run.length - 1]].installment!.no + 1) {
        run.push(i);
      } else {
        // 1로 시작하지 않거나 중간이 빈 조각. 묶지 않고 버린다.
        close();
      }
    }
    close();
  }

  return out;
}
