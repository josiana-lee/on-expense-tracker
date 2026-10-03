import { installmentLabel } from '../db/installments';
import type { ExpenseRecord } from '../db/types';

/** 아래 줄의 한 덩어리. 덩어리들은 "·"로 이어 그린다. */
export type DetailChunk =
  | { kind: 'text'; text: string }
  /** 카테고리와, 있으면 그 아래 세부항목. 카테고리는 굵게, 세부항목은 "›" 뒤에 보통 굵기로 그린다. */
  | { kind: 'category'; category: string; sub?: string };

export type RowText = {
  /** 목록 한 줄의 큰 글자. */
  title: string;
  /** 그 아래 작은 글자. */
  detail: DetailChunk[];
};

/** 목록 한 줄에 보일 두 줄의 글.
 *
 *  **제목은 사용자가 쓴 글이어야 한다.** 그런데 그 글이 들어가는 칸이 기록마다 다르다 —
 *  직접 입력하면 "영화" 같은 세부항목은 `subLabel`에, 쓴 글("치이카와 인어섬의 비밀")은
 *  `memo`에 들어간다. 가져온 기록은 원본의 "내역"이 `subLabel`에 들어간다(내역을 카테고리
 *  이름과 구별되게 위에 두려고 그렇게 정했다). 예전에는 둘 다 `subLabel`을 제목으로 써서,
 *  직접 입력한 기록은 "영화"가 위에 뜨고 쓴 글은 아래로 밀렸고 가져온 기록은 쓴 글(내역)이
 *  위에 떴다 — 같은 앱 안에서 같은 목록이 두 가지로 보였다.
 *
 *  - **직접 입력:** 메모가 있으면 메모가 제목이다. 메모가 없으면 **카테고리가 제목**이고
 *    세부항목은 아래 줄로 간다. 세부항목("점심")은 카테고리("식비")의 하위지 제목이 아니다 —
 *    예전에는 메모가 없을 때 세부항목이 윗줄로 올라가서 식비 기록이 "점심"이라는 한 단어로
 *    보였고, 어느 카테고리 소속인지는 작은 글자로 밀렸다.
 *  - **가져온 기록:** 제목은 예전 그대로다. 내역이 이미 제목 자리(`subLabel`)에 있고, 거기 딸린
 *    `memo`는 원본의 "메모" 칸이라 제목이 아니라 부가 설명이다 — 같은 규칙을 쓰면 위플 파일의
 *    메모가 내역을 밀어내고 제목이 된다.
 *
 *  **아래 줄은 위아래 관계가 보이게 한다.** 예전에는 세부항목, 카테고리, 결제수단을 같은
 *  급으로 점으로 이었는데, 영화가 문화생활의 하위라는 게 안 보이고 순서도 거꾸로였다.
 *  - 제목이 메모면 아래는 "**카테고리** › 세부항목"이다(카테고리 굵게).
 *  - 제목이 카테고리면 카테고리를 되풀이하지 않고 아래에는 세부항목만 온다.
 *  - 제목이 세부항목(가져온 기록의 내역)이면 아래에 **카테고리**만 온다. */
export function rowText(
  r: ExpenseRecord,
  categoryName: string | undefined,
  paymentName: string | undefined,
): RowText {
  const category = categoryName ?? '';
  const imported = Boolean(r.importId);

  const title = imported ? r.subLabel || category : r.memo || category || r.subLabel || '';

  const detail: DetailChunk[] = [];

  // 할부 회차를 제일 앞에 둔다. 이 줄에서 사용자가 찾는 건 "이 돈은 왜 여기 있지?"의 답이다.
  const installment = installmentLabel(r);
  if (installment) detail.push({ kind: 'text', text: installment });

  if (imported) {
    // 제목이 내역(세부항목 자리)이다. 아래에는 카테고리를 굵게.
    if (category && title !== category) detail.push({ kind: 'category', category });
  } else if (r.memo) {
    // 제목이 메모다. 카테고리 › 세부항목으로 위아래 관계를 보인다.
    if (category) {
      detail.push({ kind: 'category', category, ...(r.subLabel ? { sub: r.subLabel } : {}) });
    } else if (r.subLabel) {
      detail.push({ kind: 'text', text: r.subLabel });
    }
  } else if (r.subLabel && title !== r.subLabel) {
    // 제목이 카테고리다. 세부항목은 카테고리 자리를 이어받아 아래 줄 맨 앞에 온다.
    detail.push({ kind: 'text', text: r.subLabel });
  }

  // 가져온 기록에 딸린 메모는 원본의 부가 설명이다.
  if (imported && r.memo) detail.push({ kind: 'text', text: r.memo });

  if (paymentName) detail.push({ kind: 'text', text: paymentName });

  return { title, detail };
}

/** 입력 화면 "오늘 기록"처럼 **줄이 하나뿐인** 곳의 글.
 *
 *  이 목록은 기기 화면 높이에 따라 보이는 줄 수가 크게 달라서 두 줄로 늘리지 않는다. 대신
 *  윗줄(제목)은 달력과 같고, 달력의 아랫줄에 있던 세부항목을 **시각·결제수단 줄에 붙인다.**
 *  "카테고리 › 세부항목"을 제목에 붙이면 메모가 있는 기록에서는 세부항목이 아예 안 보였다.
 *
 *  - 직접 입력: 제목은 메모, 없으면 카테고리. 세부항목은 제목이 아닐 때 `sub`로 따로 준다.
 *  - 가져온 기록: 제목은 내역 그대로, `sub`는 없다.
 *
 *  카테고리 이름은 제목이 메모일 때 글자로는 안 보이고 앞의 동그란 아이콘 색이 말해준다. */
export type CompactRow = {
  title: string;
  /** 시각·결제수단 앞에 붙일 세부항목. 없으면 undefined. */
  sub?: string;
};

export function compactRow(r: ExpenseRecord, categoryName: string | undefined): CompactRow {
  const { title } = rowText(r, categoryName, undefined);
  const sub = !r.importId && r.subLabel && r.subLabel !== title ? r.subLabel : undefined;
  return { title, ...(sub ? { sub } : {}) };
}

/** 아래 줄을 글자로만. 화면 읽기와 테스트용이다. */
export function detailText(text: RowText): string {
  return text.detail
    .map((c) => (c.kind === 'category' ? (c.sub ? `${c.category} › ${c.sub}` : c.category) : c.text))
    .join(' · ');
}
