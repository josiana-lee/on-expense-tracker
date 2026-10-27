/* Preset expense categories — 31 items, ported from the design prototype.
   `icon` is an SVG path drawn on a 24x24 viewBox with a 1.7 stroke.
   `id` is a stable slug so user edits and records survive preset reordering. */

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  subs: string[];
  /** 정렬 값을 직접 정한다. 없으면 배열 순서대로 10씩. 나중에 끼워 넣은 프리셋이 배열 끝에 있으면서도
   *  화면에서는 어울리는 자리에 서게 하려고 둔다 — 기존 기기의 다른 프리셋 값은 바뀌지 않는다. */
  order?: number;
};

export const CATEGORIES: Category[] = [
  {
    id: 'food',
    name: '식비',
    color: '#FFB9AC',
    icon: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M17 3c-1.4 1-2 3-2 5s.6 3 2 3M7 11v10M17 11v10',
    subs: ['점심', '저녁', '아침', '배달', '카페', '술자리'],
  },
  {
    id: 'snack',
    name: '간식',
    color: '#FFD79B',
    icon: 'M4 10.5a8 4 0 0 1 16 0M5 18h14a2 2 0 0 0 0-4H5a2 2 0 0 0 0 4zM4 10.5h16',
    subs: ['편의점', '커피', '디저트', '빵'],
  },
  {
    id: 'daily',
    name: '생필품',
    color: '#B3DCC3',
    icon: 'M3 4h2l2.6 11h9.8L20 7H6M9.5 20a1 1 0 1 0 .01 0M17 20a1 1 0 1 0 .01 0',
    subs: ['마트', '생활용품', '주방', '세제'],
  },
  {
    id: 'transit',
    name: '교통비',
    color: '#A8C9F7',
    icon: 'M5 4h14v11H5zM5 15h14v3H5zM8 18v2M16 18v2M5 9.5h14',
    subs: ['지하철', '버스', '택시', '주유', '기차'],
  },
  {
    id: 'clothes',
    name: '의류',
    color: '#F7BEDA',
    icon: 'M8 3l4 2 4-2 4 3-2 3-2-1v12H8V8L6 9 4 6z',
    subs: ['상의', '하의', '신발', '가방'],
  },
  {
    id: 'culture',
    name: '문화생활',
    color: '#C0B6F4',
    icon: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    subs: ['영화', '공연', '전시', '구독', '취미'],
  },
  {
    id: 'beauty',
    name: '미용',
    color: '#FFC6D2',
    icon: 'M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z',
    subs: ['미용실', '화장품', '네일', '피부과'],
  },
  {
    id: 'health',
    name: '의료/건강',
    color: '#9BDCD6',
    icon: 'M9.5 3h5v6h6v5h-6v6h-5v-6h-6V9h6z',
    subs: ['병원', '약국', '헬스', '영양제'],
  },
  {
    id: 'education',
    name: '교육',
    color: '#FFE0A0',
    icon: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8.5 3v18',
    subs: ['도서', '강의', '자격증', '어학'],
  },
  {
    id: 'telecom',
    name: '통신비',
    color: '#B4CCFF',
    icon: 'M7 2.5h10v19H7zM10.5 19h3',
    subs: ['휴대폰', '인터넷', 'OTT'],
  },
  {
    id: 'event',
    name: '경조사',
    color: '#EDC0F2',
    icon: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2 0-4-1-4-3s3-1 4 3zM12 9c2 0 4-1 4-3s-3-1-4 3z',
    subs: ['축의금', '조의금', '선물', '생일'],
  },
  {
    id: 'cafe',
    name: '카페',
    color: '#E8D3B9',
    icon: 'M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2.5a2.5 2.5 0 0 1 0 5H16M6 5V3M10 5V3M14 5V3',
    subs: ['아메리카노', '디저트', '작업', '모임'],
  },
  {
    id: 'alcohol',
    name: '술/유흥',
    color: '#F3B7B7',
    icon: 'M5 4h9l-4 6v8M6 18h8M17 5c1.6 1.2 2 3.5 1 5.2-.8 1.4-2 1.8-3 1.8V5z',
    subs: ['맥주', '소주', '와인', '2차'],
  },
  {
    id: 'housing',
    name: '주거/월세',
    color: '#BFD6C6',
    icon: 'M3.5 11L12 4l8.5 7M5.5 10v10h13V10M10 20v-6h4v6',
    subs: ['월세', '관리비', '가스', '전기'],
  },
  {
    id: 'pet',
    name: '반려동물',
    color: '#FFCDB4',
    icon: 'M7.5 9a1.6 2 0 1 0 0-4 1.6 2 0 0 0 0 4zM16.5 9a1.6 2 0 1 0 0-4 1.6 2 0 0 0 0 4zM4.5 14a1.5 1.8 0 1 0 0-3.6 1.5 1.8 0 0 0 0 3.6zM19.5 14a1.5 1.8 0 1 0 0-3.6 1.5 1.8 0 0 0 0 3.6zM12 11c2.6 0 4.5 2.4 4.5 4.6 0 1.6-1.3 2.6-2.8 2.6-1 0-1.2-.4-1.7-.4s-.7.4-1.7.4c-1.5 0-2.8-1-2.8-2.6C7.5 13.4 9.4 11 12 11z',
    subs: ['사료', '병원', '용품', '미용'],
  },
  {
    id: 'travel',
    name: '여행',
    color: '#A9DCEF',
    icon: 'M10 3.5l1.6 6.2 7-1.9 1.4 2.2-6.2 3.4 1.3 5.4-1.9.9-3-4.6-4.2 2.3-.7-2.1 3.4-3.1L5.5 8l1.7-1.4 3.1 1.8z',
    subs: ['항공', '숙소', '교통', '관광'],
  },
  {
    id: 'insurance',
    name: '보험',
    color: '#C7C2EF',
    icon: 'M12 3.5l7 2.6v5.4c0 4.1-2.9 7.4-7 9-4.1-1.6-7-4.9-7-9V6.1zM9.2 12l2 2.2 3.6-4',
    subs: ['실비', '자동차', '연금', '종신'],
  },
  {
    id: 'utility',
    name: '공과금',
    color: '#F5D9A0',
    icon: 'M6 3h12v18l-2.4-1.6L13.2 21 12 19.4 10.8 21 8.4 19.4 6 21zM9 8h6M9 12h6',
    subs: ['전기', '수도', '가스', '관리비'],
  },
  {
    id: 'saving',
    name: '저축',
    color: '#A9D9BE',
    icon: 'M4 12c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5c0 2.3-1.2 4.2-3 5.4V20h-3v-1.6c-.6.1-1.3.2-2 .2s-1.4-.1-2-.2V20H5v-2.6C4.4 16 4 14.6 4 12.9M8 4.5C8 3.7 8.9 3 10 3M15.5 11.5h.01',
    subs: ['적금', '비상금', '투자', '연금'],
  },
  {
    id: 'car',
    name: '자동차',
    color: '#B8C7DE',
    icon: 'M4 13l1.7-4.6A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.4L20 13v5h-3v-2H7v2H4zM7 15.5h.01M17 15.5h.01',
    subs: ['주유', '주차', '정비', '보험'],
  },
  {
    id: 'fitness',
    name: '운동',
    color: '#9FD8C0',
    icon: 'M6.5 9v6M17.5 9v6M4 10.5v3M20 10.5v3M6.5 12h11',
    subs: ['헬스', '요가', '수영', '클라이밍'],
  },
  {
    id: 'hobby',
    name: '취미',
    color: '#E2C3F0',
    icon: 'M12 3.5a8.5 8.5 0 1 0 1.6 16.8c1-.2 1.2-1.4.5-2.1-.8-.8-.3-2.2.9-2.2h1.6A4.4 4.4 0 0 0 21 11.6C20.7 7 16.8 3.5 12 3.5zM8 9.5h.01M12 7.5h.01M16 9.5h.01',
    subs: ['공예', '악기', '게임', '사진'],
  },
  {
    id: 'donation',
    name: '기부/후원',
    color: '#FFC3C3',
    icon: 'M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z',
    subs: ['정기후원', '일시후원', '헌금'],
  },
  {
    id: 'childcare',
    name: '육아',
    color: '#FFDFB0',
    icon: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM9 11h.01M15 11h.01M9.5 15c.8.8 1.6 1.1 2.5 1.1s1.7-.3 2.5-1.1',
    subs: ['분유/기저귀', '병원', '교육', '용품'],
  },
  {
    id: 'device',
    name: '전자기기',
    color: '#B9CEE0',
    icon: 'M4 5.5h16v10H4zM2.5 19h19M9.5 15.5v3.5M14.5 15.5v3.5',
    subs: ['폰/노트북', '주변기기', '수리', '액세서리'],
  },
  {
    id: 'laundry',
    name: '세탁/청소',
    color: '#CFE3F0',
    icon: 'M5 4.5h14v15H5zM8 4.5V3h8v1.5M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    subs: ['세탁소', '코인세탁', '청소용역'],
  },
  {
    id: 'delivery',
    name: '택배/배송',
    color: '#EBD3B0',
    icon: 'M3.5 8L12 4l8.5 4v8L12 20l-8.5-4zM3.5 8l8.5 4 8.5-4M12 12v8',
    subs: ['택배비', '퀵', '이사', '보관'],
  },
  {
    id: 'fee',
    name: '수수료',
    color: '#D5CFE6',
    icon: 'M6 18L18 6M8 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    subs: ['이체', '환전', '연회비', '결제'],
  },
  {
    id: 'gift',
    name: '선물',
    color: '#F5C3D6',
    icon: 'M3.5 9h17v4h-17zM5.5 13h13v8h-13zM12 9v12M12 9c-2.2 0-4.2-.8-4.2-2.8S11 5 12 9zM12 9c2.2 0 4.2-.8 4.2-2.8S13 5 12 9z',
    subs: ['생일', '기념일', '답례', '집들이'],
  },
  {
    id: 'etc',
    name: '기타',
    color: '#CFD5DE',
    icon: 'M6.2 12h.01M12 12h.01M17.8 12h.01',
    subs: ['기타', '수수료', '세금'],
  },
  {
    /* 매달 나가는 구독(OTT·AI·음악·클라우드). 문화생활의 '구독', 통신비의 'OTT'는 기존 기록이 그 이름으로
       남아 있어서 그대로 둔다. 정렬은 경조사(110)와 카페(120) 사이 — 기본 홈 화면에서 카페 자리를 잇는다. */
    id: 'subscription',
    name: '구독',
    color: '#D4BFF5',
    icon: 'M16.5 3.5L20 7l-3.5 3.5M20 7H8a4 4 0 0 0-4 4M7.5 20.5L4 17l3.5-3.5M4 17h12a4 4 0 0 0 4-4',
    subs: ['OTT', 'AI', '음악', '클라우드'],
    order: 115,
  },
];

/** 카테고리를 만들거나 고칠 때 고르는 아이콘 + 색. 프리셋 30여 개가 그대로 들어가고, 아래는 프리셋이 아니라
 *  고르기만 하는 것들이다 — 구독처럼 직접 만들 카테고리를 위한 모양. */
export type Swatch = Pick<Category, 'id' | 'name' | 'color' | 'icon'>;

export const EXTRA_SWATCHES: Swatch[] = [
  {
    id: 'x-play',
    name: '재생',
    color: '#F7B9B9',
    icon: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 14.5zM10 8.5l5 3-5 3zM8 20.5h8',
  },
  {
    id: 'x-music',
    name: '음악',
    color: '#F5C6E4',
    icon: 'M9 17.5V5.5l10-2v12M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  },
  {
    id: 'x-cloud',
    name: '구름',
    color: '#B8DDF5',
    icon: 'M7.5 19a4.5 4.5 0 0 1-.4-8.98 5.5 5.5 0 0 1 10.6 1.3A3.9 3.9 0 0 1 17 19z',
  },
  {
    id: 'x-spark',
    name: '반짝',
    color: '#E4CFFA',
    icon: 'M11 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7zM19 16c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3z',
  },
  {
    id: 'x-game',
    name: '게임',
    color: '#B5E2C4',
    icon: 'M7 7.5h10a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4a2.4 2.4 0 0 1-4.1 1.2L14.5 15.5h-5l-2.1 2a2.4 2.4 0 0 1-4.1-1.2l-.7-3.4A4.5 4.5 0 0 1 7 7.5zM8 10.5v3M6.5 12h3M15.5 11.2h.01M17.8 13h.01',
  },
];

/** One page of the input screen's category grid: 4 columns x 2 rows. Visible
 *  categories past this spill onto the next page, one swipe away.
 *
 *  The row count is the fixed part — the grid shares one screen with the
 *  amount card, payment chips and 오늘 기록, which is the point of the app.
 *  It used to be 4 x 3 with a hard cap of 12, so turning a thirteenth on meant
 *  turning another off first. Dropping a row and paging the rest gave back
 *  height and left no reason for a cap. The column count lives in
 *  InputScreen.module.css (.grid) and has to agree with this. */
export const HOME_CATEGORIES_PER_PAGE = 8;

/** Shown on the input screen out of the box — two full pages. Twelve left the
 *  second page half empty, which reads as something missing rather than as a
 *  page.
 *
 *  구독이 카페 자리를 이었다 — 쓰던 기록에서 카페는 한 자릿수였고(식비·간식에도 '카페' 세부항목이 있다)
 *  구독은 매달 나가는 돈이다. 새로 설치한 기기에만 해당하고, 쓰던 기기의 홈 화면은 reconcileCategories가
 *  건드리지 않는다. */
export const DEFAULT_VISIBLE: string[] = [
  'food',
  'snack',
  'daily',
  'transit',
  'clothes',
  'culture',
  'beauty',
  'health',
  'education',
  'telecom',
  'event',
  'subscription',
  'alcohol',
  'housing',
  'utility',
  'etc',
];

/** What shipped as the default through 1.0.0 — the first page as it still is,
 *  plus four on the second. Kept so an install that never touched the home
 *  grid can be recognised and moved up to the sixteen above; see
 *  reconcileCategories(). Never edit this list — it describes the past. */
export const DEFAULT_VISIBLE_V1: string[] = [
  'food',
  'snack',
  'daily',
  'transit',
  'clothes',
  'culture',
  'beauty',
  'health',
  'education',
  'telecom',
  'event',
  'etc',
];

/* ── Preset catalogue ────────────────────────────────────────────────────
   These constants are the source of truth; the DB holds the user's copy.
   Bump PRESET_VERSION whenever the catalogue above changes so the reconcile
   pass runs — this is separate from the Dexie schema version, which only
   moves when tables or indexes change. */

export const PRESET_VERSION = 3;

export type PresetCategory = {
  /** Permanent. Doubles as the DB row id, so changing one orphans existing
   *  records — never edit a key that has shipped. */
  key: string;
  type: 'expense';
  name: string;
  colorHex: string;
  iconPath: string;
  subs: string[];
  defaultVisibleOnHome: boolean;
  defaultSortOrder: number;
};

export const PRESET_CATEGORIES: readonly PresetCategory[] = CATEGORIES.map((c, i) => ({
  key: c.id,
  type: 'expense',
  name: c.name,
  colorHex: c.color,
  iconPath: c.icon,
  subs: c.subs,
  defaultVisibleOnHome: DEFAULT_VISIBLE.includes(c.id),
  // Leaves gaps so a user can drag a category between two presets.
  defaultSortOrder: c.order ?? (i + 1) * 10,
}));
