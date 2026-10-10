import { parseDateStr } from '../db/date';

/** 메모 칸 아래에 띄우는 "전에 쓴 메모" 후보를 만든다.
 *
 *  새로 저장하는 건 없다. 이미 쌓인 기록의 메모에서 그때그때 뽑는다 — 기록을 지우면
 *  후보도 같이 사라지고, 백업·복원은 건드릴 게 없다. 가져온 기록의 내역도 메모로
 *  들어와 있어서 처음부터 후보가 된다. */

/** 후보를 뽑을 때 기록에서 읽는 것. */
export type MemoRow = {
  memo?: string;
  categoryId: string;
  /** 원. 할부면 한 회차가 아니라 결제 총액을 넣는다 — 사람이 금액 칸에 치는 건 총액이다. */
  amount: number;
  date: string;
  installmentId?: string;
};

/** (카테고리, 메모) 한 쌍이 쌓아 둔 이력. */
export type MemoStat = {
  memo: string;
  /** 비교용으로 다듬은 메모. 한글을 자모로 풀어서 글자를 치는 도중에도 앞글자가 맞는다. */
  key: string;
  categoryId: string;
  /** 자주, 그리고 최근에 쓸수록 큰 값. */
  score: number;
  /** 가장 최근 몇 번의 금액, 새것부터. */
  amounts: number[];
};

/** 한 번 쓴 기록이 점수에 더하는 몫은 이만큼 지날 때마다 반으로 준다. 예전에 매일 가던
 *  가게가 지금 가는 가게를 밀어내지 않게 하려는 값이다. */
const HALF_LIFE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 후보 한 건에 남겨 두는 금액 수. 금액이 비슷한지 볼 때만 쓴다. */
const KEPT_AMOUNTS = 5;

/** 금액이 "비슷하다"고 보는 폭. 지난 금액의 ±15%. */
const SIMILAR = 0.15;

/** 칩으로 보여주는 최대 개수. */
export const MAX_SUGGESTIONS = 8;

/** 메모를 비교하기 위한 모양.
 *
 *  한글을 자모로 풀어(NFKD) 둔다. 글자를 조합하는 중에는 칸의 내용이 "롯ㄷ"처럼 끝
 *  글자가 자음 하나인데, 풀어 두면 이것이 "롯데"의 앞부분이 되어서 "롯데리아"가 글자
 *  사이마다 사라졌다 나타나지 않는다. 호환 자모("ㄷ")도 NFKD가 같은 자모로 바꿔 준다.
 *  영문은 대소문자를 가리지 않는다. */
export function memoKey(text: string): string {
  return text.trim().normalize('NFKD').toLowerCase();
}

/** 기록에서 (카테고리, 메모)별 이력을 만든다.
 *
 *  할부로 묶인 기록은 한 번만 센다. 6개월 할부는 같은 메모의 행이 여섯 개인데, 그대로
 *  세면 한 번 산 것이 여섯 번 쓴 것처럼 점수를 차지한다. */
export function buildMemoStats(rows: Iterable<MemoRow>, today: Date): MemoStat[] {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const seen = new Map<string, MemoRow>();
  const singles: MemoRow[] = [];
  for (const r of rows) {
    if (!r.memo?.trim()) continue;
    if (!r.installmentId) {
      singles.push(r);
      continue;
    }
    // 묶음에서는 가장 이른 회차 하나만 남긴다. 어느 행을 만나든 같은 답이 나오게.
    const prev = seen.get(r.installmentId);
    if (!prev || r.date < prev.date) seen.set(r.installmentId, r);
  }

  type Acc = MemoStat & { used: { date: string; amount: number }[] };
  const acc = new Map<string, Acc>();
  for (const r of [...singles, ...seen.values()]) {
    const memo = r.memo!.trim();
    const id = `${r.categoryId}\u0000${memo}`;
    let a = acc.get(id);
    if (!a) {
      a = { memo, key: memoKey(memo), categoryId: r.categoryId, score: 0, amounts: [], used: [] };
      acc.set(id, a);
    }
    const age = Math.max(0, (t0 - parseDateStr(r.date).getTime()) / DAY_MS);
    a.score += Math.pow(0.5, age / HALF_LIFE_DAYS);
    a.used.push({ date: r.date, amount: r.amount });
  }

  return [...acc.values()].map(({ used, ...stat }) => ({
    ...stat,
    amounts: used
      .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
      .slice(0, KEPT_AMOUNTS)
      .map((u) => u.amount),
  }));
}

function isSimilar(amounts: number[], amount: number): boolean {
  if (!(amount > 0)) return false;
  return amounts.some((a) => a > 0 && Math.abs(a - amount) <= a * SIMILAR);
}

/** 지금 칸에 보여줄 후보, 위에 둘 것부터.
 *
 *  ① 같은 카테고리가 먼저, ② 그 안에서 금액이 비슷한 것을 위로, ③ 나머지는 자주·최근 쓴
 *  순. 다른 카테고리의 메모는 **글자를 쳤을 때만** 뒤에 붙는다 — 비어 있을 때 다른
 *  카테고리 것까지 보이면 "이 카테고리의 최근 메모"라는 말이 거짓이 된다.
 *
 *  글자를 쳤으면 그 글자로 시작하는 것만 남긴다. 칸에 이미 그대로 적힌 메모는 후보에서
 *  뺀다 — 눌러도 아무 일도 안 일어나는 칩이 된다. 같은 메모가 여러 카테고리에 있으면
 *  가장 높은 자리의 하나만 보인다. */
export function suggestMemos(
  stats: MemoStat[],
  opts: { categoryId: string; amount: number; text: string; limit?: number },
): string[] {
  const typed = memoKey(opts.text);
  const limit = opts.limit ?? MAX_SUGGESTIONS;

  const ranked = stats
    .filter((s) =>
      typed === ''
        ? s.categoryId === opts.categoryId
        : s.key.startsWith(typed) && s.key !== typed,
    )
    .map((s) => ({
      s,
      other: s.categoryId === opts.categoryId ? 0 : 1,
      far: isSimilar(s.amounts, opts.amount) ? 0 : 1,
    }))
    .sort(
      (a, b) =>
        a.other - b.other ||
        a.far - b.far ||
        b.s.score - a.s.score ||
        // 점수가 같을 때 순서가 매번 달라지지 않게.
        (a.s.memo < b.s.memo ? -1 : a.s.memo > b.s.memo ? 1 : 0),
    );

  const out: string[] = [];
  for (const { s } of ranked) {
    if (out.includes(s.memo)) continue;
    out.push(s.memo);
    if (out.length >= limit) break;
  }
  return out;
}
