/** CSV 한 덩어리를 행×칸으로 쪼갠다.
 *
 *  라이브러리를 쓰지 않는 이유: 가져오기에 필요한 건 RFC 4180의 작은 부분이고,
 *  그건 아래 마흔 줄이면 된다. 의존성 하나를 늘리는 것보다 싸고, 무엇보다
 *  따옴표와 줄바꿈 처리를 테스트로 직접 묶어둘 수 있다 — 여기서 한 칸이 밀리면
 *  금액 자리에 카테고리가 들어가고 그게 수천 건이 된다.
 *
 *  split(',')을 쓰지 않는 이유도 같다. 금액이 "151,086"으로 적혀 오는 파일이
 *  실제로 있다. */
export function parseCsv(text: string): string[][] {
  // 엑셀이 저장한 파일 맨 앞의 BOM. 두면 첫 열 이름이 "﻿사용자"가 된다.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch !== '"') {
        cell += ch;
      } else if (src[i + 1] === '"') {
        // 두 겹 따옴표는 한 겹 따옴표 자신이다.
        cell += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      // CRLF는 두 글자지만 한 번만 끊는다.
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      /* 칸이 하나고 그게 비었으면 빈 줄이다. 버리지 않으면 파일 끝 줄바꿈
         하나가 빈 행으로 들어와 "1건을 못 읽었어"가 된다. */
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  // 마지막 줄에 줄바꿈이 없을 수 있다.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}
