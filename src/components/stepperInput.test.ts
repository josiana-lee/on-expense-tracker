import { describe, expect, it } from 'vitest';

import { cleanDraft, readDraft, step } from './stepperInput';

describe('cleanDraft', () => {
  it('숫자가 아닌 글자는 뺀다', () => {
    expect(cleanDraft('1a5', 28)).toBe('15');
    expect(cleanDraft('−+e.', 28)).toBe('');
    expect(cleanDraft('１５', 28)).toBe('');
  });

  /* max가 28이면 두 자리까지. 세 번째 글자는 어차피 28을 넘는다. */
  it('max의 자릿수까지만 남긴다', () => {
    expect(cleanDraft('123', 28)).toBe('12');
    expect(cleanDraft('5', 28)).toBe('5');
    expect(cleanDraft('12', 9)).toBe('1');
  });
});

describe('readDraft', () => {
  it('범위 안의 값은 그대로 읽는다', () => {
    expect(readDraft('15', 1, 28)).toBe(15);
    expect(readDraft('1', 1, 28)).toBe(1);
    expect(readDraft('28', 1, 28)).toBe(28);
  });

  it('앞의 0은 무시한다', () => {
    expect(readDraft('05', 1, 28)).toBe(5);
  });

  it('범위를 넘으면 가까운 끝으로 맞춘다', () => {
    expect(readDraft('30', 1, 28)).toBe(28);
    expect(readDraft('99', 1, 28)).toBe(28);
    expect(readDraft('0', 1, 28)).toBe(1);
    expect(readDraft('00', 1, 28)).toBe(1);
  });

  /* 비운 채로 떠나면 원래 값을 둔다. 0이나 1로 읽어서 바꿔버리면 지우다 만 사람의
     결제일이 말없이 바뀐다. */
  it('숫자가 없으면 null이다', () => {
    expect(readDraft('', 1, 28)).toBeNull();
    expect(readDraft('abc', 1, 28)).toBeNull();
  });
});

describe('step', () => {
  it('한 칸씩 움직인다', () => {
    expect(step(15, 1, 1, 31)).toBe(16);
    expect(step(15, -1, 1, 31)).toBe(14);
  });

  it('끝에서 반대쪽으로 넘어간다', () => {
    expect(step(31, 1, 1, 31)).toBe(1);
    expect(step(1, -1, 1, 31)).toBe(31);
  });

  it('끝 바로 앞에서는 넘어가지 않는다', () => {
    expect(step(30, 1, 1, 31)).toBe(31);
    expect(step(2, -1, 1, 31)).toBe(1);
  });
});
