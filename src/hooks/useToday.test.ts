import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fmt } from '../db/date';
import { useToday } from './useToday';

/* 이 버그는 자정을 넘겨야 드러난다. 기다리는 테스트는 쓸 수 없으니 시계를
   옮겨서 검사한다. 안 쓰면 다음에 누가 `useMemo(() => new Date(), [])`로
   되돌려놔도 아무도 모른다.

   react를 통째로 갈아끼우는 이유: 이 훅은 useState와 useEffect만 쓰고
   렌더 트리가 필요 없다. 테스트 라이브러리를 새로 들이는 것보다 이 열몇
   줄이 싸다. */
vi.mock('react', () => {
  const store: unknown[] = [];
  let cursor = 0;
  const effects: Array<() => void | (() => void)> = [];
  let rerender = () => {};
  return {
    useState<S>(init: S | (() => S)) {
      const i = cursor++;
      if (!(i in store)) store[i] = typeof init === 'function' ? (init as () => S)() : init;
      const set = (next: S | ((p: S) => S)) => {
        const prev = store[i] as S;
        const value = typeof next === 'function' ? (next as (p: S) => S)(prev) : next;
        if (!Object.is(value, prev)) {
          store[i] = value;
          rerender();
        }
      };
      return [store[i] as S, set];
    },
    useEffect(fn: () => void | (() => void)) {
      effects.push(fn);
    },
    __reset() {
      store.length = 0;
      cursor = 0;
      effects.length = 0;
    },
    __render(hook: () => unknown, onValue: (v: unknown) => void) {
      cursor = 0;
      onValue(hook());
      rerender = () => {
        cursor = 0;
        onValue(hook());
      };
      return effects.map((f) => f()).filter((c) => typeof c === 'function') as Array<() => void>;
    },
  };
});

type MockReact = {
  __reset(): void;
  __render(hook: () => unknown, onValue: (v: unknown) => void): Array<() => void>;
};

describe('useToday', () => {
  let react: MockReact;
  let cleanups: Array<() => void> = [];
  let latest: Date;

  beforeEach(async () => {
    react = (await import('react')) as unknown as MockReact;
    react.__reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanups.forEach((c) => c());
    cleanups = [];
    vi.useRealTimers();
  });

  const mount = () => {
    cleanups = react.__render(useToday, (v) => {
      latest = v as Date;
    });
  };

  it('자정을 넘기면 새 날짜를 낸다', () => {
    vi.setSystemTime(new Date('2026-08-11T23:59:30'));
    mount();
    expect(fmt(latest)).toBe('2026-08-11');

    vi.advanceTimersByTime(31_000);
    expect(fmt(latest)).toBe('2026-08-12');
  });

  it('같은 날 안에서는 같은 객체를 유지한다', () => {
    vi.setSystemTime(new Date('2026-08-11T09:00:00'));
    mount();
    const first = latest;

    vi.setSystemTime(new Date('2026-08-11T18:30:00'));
    document.dispatchEvent(new Event('visibilitychange'));

    // 같은 참조여야 React가 리렌더를 건너뛴다.
    expect(latest).toBe(first);
  });

  /* 실제로 이 버그가 드러나는 경로. 백그라운드에서는 타이머가 눌리거나
     멈추므로 자정 타이머만으로는 부족하다. */
  it('백그라운드에서 자정을 넘기고 돌아와도 갱신된다', () => {
    vi.setSystemTime(new Date('2026-08-11T23:00:00'));
    mount();
    expect(fmt(latest)).toBe('2026-08-11');

    // 타이머는 안 돈 채로 시계만 다음 날로 — 백그라운드에서 눌린 상황
    vi.setSystemTime(new Date('2026-08-12T08:00:00'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fmt(latest)).toBe('2026-08-12');
  });
});
