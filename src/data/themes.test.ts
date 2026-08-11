import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme } from './themes';

/* 색은 tokens.css에 있고 themes.ts는 설정 화면에 보여줄 사본을 든다.
 * 어긋나도 아무것도 깨지지 않는다 — 고른 테마와 다른 색의 동그라미가
 * 떠 있을 뿐이고, 화면은 정상으로 보인다. 그래서 여기서 대조한다. */
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function block(re: RegExp): string {
  return tokens.match(re)?.[1] ?? '';
}

/* `:root`를 앞에 붙여 고정한다. 그냥 `[data-palette='mint']`로 찾으면
   어두운 모드 선택자의 꼬리(`...[data-theme='dark'][data-palette='mint']`)에도
   걸려서 엉뚱한 블록을 읽는다. */
const lightBlock = (id: string) =>
  block(new RegExp(`:root\\[data-palette='${id}'\\]\\s*\\{([^}]*)\\}`));

const darkBlock = (id: string) =>
  block(new RegExp(`:root\\[data-theme='dark'\\]\\[data-palette='${id}'\\]\\s*\\{([^}]*)\\}`));

const rootBlock = () => block(/:root\s*\{([^}]*)\}/);

function tokenIn(body: string, name: string): string | undefined {
  return body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
}

describe('색 테마', () => {
  it('테마마다 밝은 모드 블록이 있고, 배경·보조표면·선·포인트를 모두 정한다', () => {
    for (const t of COLOR_THEMES) {
      const body = lightBlock(t.id);
      for (const name of ['bg', 'sf2', 'line', 'brand', 'brandSoft']) {
        expect(tokenIn(body, name), `${t.id}의 --${name}`).toBeDefined();
      }
    }
  });

  it('설정 화면의 동그라미 색이 tokens.css의 --brand와 같다', () => {
    for (const t of COLOR_THEMES) {
      const brand = tokenIn(lightBlock(t.id), 'brand');
      expect(brand?.toLowerCase(), `${t.id}`).toBe(t.swatch.toLowerCase());
    }
  });

  /* 어두운 모드는 포인트만 바꾸기로 한 결정. 배경까지 물들이면 탁해지고,
     그 차이는 어두운 화면에서 잘 보이지도 않는다. 블록에 중립색이 끼어드는
     순간 그 결정이 조용히 뒤집히므로 여기서 막는다. */
  it('어두운 모드 블록은 포인트 색만 바꾼다', () => {
    for (const t of COLOR_THEMES) {
      const body = darkBlock(t.id);
      expect(body, `${t.id} 어두운 모드 블록`).not.toBe('');

      const declared = [...body.matchAll(/--([a-zA-Z]+):/g)].map((m) => m[1]).sort();
      expect(declared, `${t.id}`).toEqual(['brand', 'brandSoft']);
    }
  });

  /* 빨강 계열을 뺀 이유가 --warn(예산 초과·삭제)과 색조가 겹쳐서였다.
     포인트가 경고색과 같아지면 "초과했어"가 그냥 앱 색으로 보인다. */
  it('포인트 색이 경고색과 겹치지 않는다', () => {
    const warn = tokenIn(rootBlock(), 'warn')!;
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    };
    const warnHue = hue(warn);
    for (const t of COLOR_THEMES) {
      // 색상환은 원이라 359°와 1°는 2° 차이다. 그 회전을 접어서 0~180으로.
      const gap = Math.abs(((hue(t.swatch) - warnHue + 540) % 360) - 180);
      expect(gap, `${t.name}과 경고색의 색조 차이(도)`).toBeGreaterThan(30);
    }
  });

  it('기본값이 목록에 있다', () => {
    expect(isColorTheme(DEFAULT_COLOR_THEME)).toBe(true);
    expect(isColorTheme('red')).toBe(false);
  });
});
