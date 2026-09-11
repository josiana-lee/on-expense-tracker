import type { KeyboardEvent } from 'react';

/** 키보드의 '완료'·'검색' 키를 누르면 키보드를 내린다.
 *
 *  `enterKeyHint`는 그 키에 적히는 글자만 바꾼다. 누르면 입력칸에 Enter가
 *  들어올 뿐인데, 이 앱의 입력칸은 폼 안에 있지 않아서 Enter로 일어나는 일이
 *  없다 — 버튼에 '완료'라고 써 있는데 눌러도 키보드가 그대로 남는다.
 *  포커스를 빼면 안드로이드가 키보드를 닫는다.
 *
 *  한글 조합 중(isComposing)인지는 거르지 않는다. 키보드에 따라 조합이 끝나기
 *  전에 Enter가 먼저 들어올 수 있고, 그걸 걸러내면 그 기기에서는 '완료'가 다시
 *  먹통이 된다. blur는 조합 중이던 글자를 확정하고 나가서 잃는 글자가 없다. */
export function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}
