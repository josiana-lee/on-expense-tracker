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

/* NFKD가 한글 음절을 풀어 주는 낱자(conjoining jamo)를, 한 번 더 기본 자모로 푼다.
   초성/중성/종성 순서(유니코드 표 순서)다. 겹받침(ㄺ)과 겹모음(ㅘ)은 두 자모로 쪼갠다. */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ',
];
const JONG = [
  'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

function flattenJamo(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x1100 && cp <= 0x1112) return CHO[cp - 0x1100];
  if (cp >= 0x1161 && cp <= 0x1175) return JUNG[cp - 0x1161];
  if (cp >= 0x11a8 && cp <= 0x11c2) return JONG[cp - 0x11a8];
  return ch;
}

/** 메모를 비교하기 위한 모양.
 *
 *  한글을 **기본 자모의 줄**로 푼다("닭" → ㄷㅏㄹㄱ). 글자를 조합하는 중에는 칸의 내용이
 *  완성되기 전 모양이라 — "롯ㄷ", "닭"을 치는 도중의 "달", "화"를 치는 도중의 "호" —
 *  그대로 비교하면 최종 글자의 앞부분이 아니다. 자모의 줄로 풀면 이 중간 모양이 모두
 *  최종 글자의 앞부분이 되어서, 글자 사이마다 칩이 사라졌다 나타나지 않는다.
 *
 *  - 겹받침(ㄺ)과 겹모음(ㅘ)을 두 자모로 쪼갠다. 안 쪼개면 "달"이 "닭"의 앞부분이
 *    아니고, "호"가 "화"의 앞부분이 아니다.
 *  - 받침과 다음 글자의 첫 자음을 같은 자모로 본다. "롯"(받침 ㅅ)을 치다가 "로시"가
 *    되는 순간에도 이어진다.
 *  - 호환 자모("ㄷ")는 NFKD가 먼저 낱자로 바꿔 준다.
 *
 *  영문은 대소문자를 가리지 않는다. */
export function memoKey(text: string): string {
  return [...text.trim().normalize('NFKD').toLowerCase()].map(flattenJamo).join('');
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

  /* 같은 카테고리에서 비교 키가 같으면 한 후보다("GS25"와 "gs25"). 칩에 둘이 나란히 뜨면
     같은 가게를 두 칸 쓰고 어느 쪽이 맞는지 고민하게 만든다. 보여줄 표기는 가장 최근에 쓴
     것이고, 점수와 금액은 합친다. */
  type Acc = MemoStat & { used: { date: string; amount: number }[]; latest: string };
  const acc = new Map<string, Acc>();
  for (const r of [...singles, ...seen.values()]) {
    const memo = r.memo!.trim();
    const key = memoKey(memo);
    const id = `${r.categoryId}\u0000${key}`;
    let a = acc.get(id);
    if (!a) {
      a = { memo, key, categoryId: r.categoryId, score: 0, amounts: [], used: [], latest: r.date };
      acc.set(id, a);
    } else if (r.date > a.latest || (r.date === a.latest && memo < a.memo)) {
      // 날짜가 같으면 글자가 작은 쪽 — 어느 행을 먼저 만나든 같은 답이 나오게.
      a.memo = memo;
      a.latest = r.date;
    }
    const age = Math.max(0, (t0 - parseDateStr(r.date).getTime()) / DAY_MS);
    a.score += Math.pow(0.5, age / HALF_LIFE_DAYS);
    a.used.push({ date: r.date, amount: r.amount });
  }

  return [...acc.values()].map(({ used, latest: _latest, ...stat }) => ({
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
 *  가장 높은 자리의 하나만 보인다(철자만 다른 것도 같은 메모로 본다). */
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
  const seenKeys = new Set<string>();
  for (const { s } of ranked) {
    if (seenKeys.has(s.key)) continue;
    seenKeys.add(s.key);
    out.push(s.memo);
    if (out.length >= limit) break;
  }
  return out;
}
