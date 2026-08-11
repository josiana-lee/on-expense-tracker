/** 색 테마 목록.
 *
 *  실제 색 값은 styles/tokens.css의 `[data-palette]` 블록에 있고, 여기 있는
 *  swatch는 설정 화면에서 동그라미로 보여줄 때만 쓰는 사본이다. CSS 변수는
 *  :root에 걸려 있어서 목록의 항목 하나하나에 다른 색을 입히려면 어차피
 *  JS 쪽에 값이 필요하다.
 *
 *  사본인 이상 어긋날 수 있으므로 themes.test.ts가 tokens.css를 읽어
 *  대조한다. 색을 바꿀 땐 두 곳을 같이 고치면 되고, 빠뜨리면 테스트가 잡는다. */
export const COLOR_THEMES = [
  { id: 'purple', name: '퍼플', swatch: '#7b87f5' },
  { id: 'mint', name: '민트', swatch: '#22a38c' },
  { id: 'pink', name: '핑크', swatch: '#dd5c9b' },
  { id: 'yellow', name: '옐로우', swatch: '#c98a12' },
  { id: 'blue', name: '블루', swatch: '#3d86db' },
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number]['id'];

/** 지금까지의 화면. 이 값을 고르면 테마 기능이 없던 때와 같아진다. */
export const DEFAULT_COLOR_THEME: ColorTheme = 'purple';

export function isColorTheme(value: unknown): value is ColorTheme {
  return COLOR_THEMES.some((t) => t.id === value);
}
