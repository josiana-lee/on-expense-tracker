/** Stepper의 숫자 칸에 사용자가 적는 글자를 다룬다.
 *
 *  칸은 `type="text"`다. `type="number"`는 e·+·−를 받고, 지웠다 쓰는 사이에 빈 값과
 *  NaN을 오가며, 스피너가 붙는 기기도 있다. 숫자만 남기는 일은 여기서 한다. */

/** 숫자가 아닌 글자를 빼고, max의 자릿수까지만 남긴다. 붙여넣기도 이 길로 온다. */
export function cleanDraft(text: string, max: number): string {
  return text.replace(/\D/g, '').slice(0, String(max).length);
}

/** ± 한 번에 움직인 값. min~max를 한 바퀴로 보고 끝에서 반대쪽으로 넘어간다
 *  (31에서 +는 1, 1에서 −는 31).
 *
 *  이 칸은 전부 "며칠"을 고른다. 달력의 날짜는 31 다음이 1이라서, 끝에서 멈추면
 *  1일로 가려는 사람이 − 를 30번 눌러야 한다. */
export function step(value: number, delta: 1 | -1, min: number, max: number): number {
  const next = value + delta;
  if (next > max) return min;
  if (next < min) return max;
  return next;
}

/** 적고 있는 글자가 가리키는 값. 범위 밖이면 가까운 쪽 끝으로 맞추고, 아직 숫자가
 *  없으면(빈 칸) null — 그때는 원래 값을 그대로 둔다.
 *
 *  적는 도중에도, 칸을 떠날 때도 같은 규칙을 쓴다. "30"을 적으면 칸에는 30이 보이는
 *  동안에도 값은 이미 28이라서, 칸을 떠나 28로 바뀌는 순간 다른 값이 튀어나오지 않는다. */
export function readDraft(text: string, min: number, max: number): number | null {
  const digits = cleanDraft(text, max);
  if (digits === '') return null;
  return Math.min(max, Math.max(min, Number(digits)));
}
