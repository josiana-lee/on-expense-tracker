import type { Epoch, ID } from './types';

/** UUIDv7. v4 대신 쓰는 이유는 시간 정렬이 되기 때문 — IndexedDB B-tree 삽입
 *  지역성이 좋고, id 자체가 생성 순서를 담아 정렬 키를 하나 아낀다. */
export function uuidv7(): ID {
  const ts = Date.now();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[0] = (ts / 2 ** 40) & 0xff;
  b[1] = (ts / 2 ** 32) & 0xff;
  b[2] = (ts / 2 ** 24) & 0xff;
  b[3] = (ts / 2 ** 16) & 0xff;
  b[4] = (ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let lastTs = 0;

/** 같은 밀리초에 여러 번 호출해도 updatedAt이 뒤로 가지 않게 보장한다. */
export function now(): Epoch {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}
