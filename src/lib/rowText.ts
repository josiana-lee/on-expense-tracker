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
 *  **제목은 사용자가 쓴 글, 곧 메모다.** 직접 입력한 기록도 가져온 기록도 같은 칸에 같은 것이
 *  들어 있다 — 메모는 쓴 글(제목), 세부항목은 카테고리 아래 칩에서 고른 것. (가져온 기록은
 *  예전에 내역을 세부항목 칸에 넣어서 규칙이 둘로 갈렸는데, 수정 화면에서 고칠 수 없는 문제와
 *  같이 없앴다. lib의 importers/migrate.ts가 이미 가져온 기록을 옮긴다.)
 *
 *  - 메모가 있으면 메모가 제목이고, 아래는 "**카테고리** › 세부항목"(카테고리 굵게)이다.
 *  - 메모가 없으면 **카테고리가 제목**이고 세부항목은 아래 줄로 간다. 세부항목("점심")은
 *    카테고리("식비")의 하위지 제목이 아니다.
 *
 *  할부 회차는 아래 줄 맨 앞이고, 결제수단은 맨 뒤다. 입력한 값은 어디엔가 반드시 보인다. */
export function rowText(
  r: ExpenseRecord,
  categoryName: string | undefined,
  paymentName: string | undefined,
): RowText {
  const category = categoryName ?? '';
  const title = r.memo || category || r.subLabel || '';

  const detail: DetailChunk[] = [];

  // 할부 회차를 제일 앞에 둔다. 이 줄에서 사용자가 찾는 건 "이 돈은 왜 여기 있지?"의 답이다.
  const installment = installmentLabel(r);
  if (installment) detail.push({ kind: 'text', text: installment });

  if (r.memo) {
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
 *
 *  카테고리 이름은 제목이 메모일 때 글자로는 안 보이고 앞의 동그란 아이콘 색이 말해준다. */
export type CompactRow = {
  title: string;
  /** 시각·결제수단 앞에 붙일 세부항목. 없으면 undefined. */
  sub?: string;
};

export function compactRow(r: ExpenseRecord, categoryName: string | undefined): CompactRow {
  const { title } = rowText(r, categoryName, undefined);
  const sub = r.subLabel && r.subLabel !== title ? r.subLabel : undefined;
  return { title, ...(sub ? { sub } : {}) };
}

/** 아래 줄을 글자로만. 화면 읽기와 테스트용이다. */
export function detailText(text: RowText): string {
  return text.detail
    .map((c) => (c.kind === 'category' ? (c.sub ? `${c.category} › ${c.sub}` : c.category) : c.text))
    .join(' · ');
}
