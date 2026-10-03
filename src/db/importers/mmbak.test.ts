import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

import { isMmbak, parseMmbak, type SqlDb } from './mmbak';

/* 실제 파일의 스키마 중 읽는 열만 옮겼다. 통째로 옮기지 않은 이유는 나머지
   열(동기화·위치·문자 원문 등)이 어댑터와 상관없어서다. */
const SCHEMA = `
  CREATE TABLE INOUTCOME (AID INTEGER PRIMARY KEY, uid TEXT, assetUid TEXT, ctgUid TEXT,
    ZCONTENT VARCHAR, ZDATE VARCHAR, DO_TYPE VARCHAR, ZMONEY VARCHAR, IS_DEL INTEGER,
    CARD_DIVIDE_MONTH_STR VARCHAR, cardDivideUid TEXT);
  CREATE TABLE ZCATEGORY (ID INTEGER PRIMARY KEY, uid TEXT, NAME TEXT, TYPE INTEGER, pUid TEXT);
  CREATE TABLE ASSETS (ID INTEGER PRIMARY KEY, uid TEXT, NIC_NAME TEXT, groupUid TEXT);
  CREATE TABLE ASSETGROUP (DEVICE_ID INTEGER PRIMARY KEY, uid TEXT, ACC_GROUP_NAME TEXT, TYPE INTEGER);

  INSERT INTO ASSETGROUP (uid, ACC_GROUP_NAME, TYPE) VALUES
    ('1','은행',1), ('2','카드',2), ('3','체크카드',3), ('11','현금',11);
  INSERT INTO ASSETS (uid, NIC_NAME, groupUid) VALUES
    ('a-card','삼성카드','2'), ('a-chk','국민체크','3'), ('a-cash','현금','11'), ('a-bank','우리은행','1');
  INSERT INTO ZCATEGORY (uid, NAME, TYPE) VALUES
    ('c-food','🍜 식비',1), ('c-pay','월급',0), ('c-x','이체분류',1);
`;

// 2026-10-03 12:00:17 KST. 날짜는 로컬 기준으로 읽으므로 시각을 한낮에 둬서 시간대가
// 달라도 같은 날이 되게 한다.
const MS = Date.UTC(2026, 9, 3, 3, 0, 17);

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  /* wasm을 직접 읽어 넘긴다. jsdom 환경에서는 sql.js가 웹으로 착각해 파일 경로
     대신 fetch를 쓰려 하는데, 바이너리를 주면 어느 쪽이든 상관없다. */
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
  SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
});

function db(...inserts: string[]): Database & SqlDb {
  const d = new SQL.Database();
  d.run(SCHEMA);
  for (const sql of inserts) d.run(sql);
  return d as Database & SqlDb;
}

const tx = (
  p: Partial<{
    asset: string; ctg: string; content: string; ms: number; doType: number | string;
    money: string; del: number; str: string; divUid: string;
  }> = {},
) => {
  const v = {
    asset: 'a-card', ctg: 'c-food', content: '김밥', ms: MS, doType: 1, money: '7400.0',
    del: 0, str: '', divUid: '', ...p,
  };
  return `INSERT INTO INOUTCOME (assetUid, ctgUid, ZCONTENT, ZDATE, DO_TYPE, ZMONEY, IS_DEL,
    CARD_DIVIDE_MONTH_STR, cardDivideUid) VALUES
    ('${v.asset}','${v.ctg}','${v.content}','${v.ms}','${v.doType}','${v.money}',${v.del},'${v.str}','${v.divUid}')`;
};

/* 하위 분류. 실제 파일에서 최상위는 pUid가 '0'이고 하위는 상위의 uid를 가진다. */
const CHILDREN = `INSERT INTO ZCATEGORY (uid, NAME, TYPE, pUid) VALUES
  ('c-trans','🚖 교통/차량',1,'0'), ('c-taxi','택시',1,'c-trans'), ('c-snack','간식',1,'c-food')`;

describe('isMmbak', () => {
  it('필요한 표와 열이 다 있으면 알아본다', () => {
    expect(isMmbak(db())).toBe(true);
  });

  /* SQLite 파일이라고 다 이 앱의 것은 아니다. 표가 없는 파일을 읽으려 들면
     쿼리가 터지거나, 더 나쁘게는 비슷한 이름의 다른 표를 읽는다. */
  it('다른 SQLite 파일은 알아보지 못한다', () => {
    const other = new SQL.Database();
    other.run('CREATE TABLE notes (id INTEGER, body TEXT)');
    expect(isMmbak(other as unknown as SqlDb)).toBe(false);
  });

  it('표는 있어도 열이 모자라면 알아보지 못한다', () => {
    const half = new SQL.Database();
    half.run('CREATE TABLE INOUTCOME (AID INTEGER)');
    half.run('CREATE TABLE ZCATEGORY (uid TEXT)');
    half.run('CREATE TABLE ASSETS (uid TEXT)');
    half.run('CREATE TABLE ASSETGROUP (uid TEXT)');
    expect(isMmbak(half as unknown as SqlDb)).toBe(false);
  });
});

describe('parseMmbak', () => {
  it('한 건을 우리 모양으로 바꾼다', () => {
    const [row] = parseMmbak(db(tx())).rows;
    expect(row).toMatchObject({
      amount: 7400,
      categoryName: '🍜 식비',
      label: '김밥',
      paymentName: '삼성카드',
      paymentKind: 'credit',
    });
    expect(row.date).toBe('2026-10-03');
  });

  /* 원본이 밀리초 시각을 갖고 있다. 버리면 하루치가 전부 00:00이 된다.
     예전 테스트는 HH:mm 모양이기만 하면 통과해서 시각이 틀려도 몰랐다. 저녁
     시각으로 잡아서 날짜가 밀리는지(UTC를 로컬로 바꾸다 다음 날로 넘어가는 경우)와
     시각 자체를 같이 본다. */
  it('날짜에 든 시각과 날짜를 그대로 살린다', () => {
    const evening = new Date(2026, 9, 3, 22, 47, 5).getTime();
    const [row] = parseMmbak(db(tx({ ms: evening }))).rows;
    expect(row.date).toBe('2026-10-03');
    expect(row.time).toBe('22:47');
  });

  it('자정 직후도 그날로 읽는다', () => {
    const justAfter = new Date(2026, 9, 4, 0, 3, 0).getTime();
    const [row] = parseMmbak(db(tx({ ms: justAfter }))).rows;
    expect(row.date).toBe('2026-10-04');
    expect(row.time).toBe('00:03');
  });

  it('삭제된 기록은 읽지 않고, 못 읽은 줄로도 세지 않는다', () => {
    const out = parseMmbak(db(tx(), tx({ del: 1 })));
    expect(out.rows).toHaveLength(1);
    // 사용자가 직접 지운 것이라 "못 읽었다"고 알릴 일이 아니다.
    expect(out.skipped).toBe(0);
  });

  it('금액 문자열 "50000.0"을 정수로 읽는다', () => {
    expect(parseMmbak(db(tx({ money: '50000.0' }))).rows[0].amount).toBe(50000);
  });

  /* 하위 분류를 쓴 기록은 그 하위 이름과 상위 이름을 같이 넘긴다. 어느 쪽을 쓸지는
     우리 카테고리를 봐야 정해져서 plan이 고른다. */
  describe('하위 분류', () => {
    it('하위 분류를 쓴 기록은 하위를 분류로, 상위를 parentName으로 넘긴다', () => {
      const [row] = parseMmbak(db(CHILDREN, tx({ ctg: 'c-taxi', content: '이동 택시' }))).rows;
      expect(row.categoryName).toBe('택시');
      expect(row.parentName).toBe('🚖 교통/차량');
      expect(row.label).toBe('이동 택시');
    });

    it('최상위 분류를 쓴 기록에는 parentName이 없다', () => {
      const [row] = parseMmbak(db(CHILDREN, tx())).rows;
      expect(row.categoryName).toBe('🍜 식비');
      expect(row.parentName).toBeUndefined();
    });

    it('내역이 비면 하위 분류 이름이 내역이 된다', () => {
      const [row] = parseMmbak(db(CHILDREN, tx({ ctg: 'c-taxi', content: '' }))).rows;
      expect(row.label).toBe('택시');
    });

    /* 상위 분류 열이 없는 판의 파일이 "알아볼 수 없는 파일"이 되면 안 된다. */
    it('상위 분류 열이 없는 파일도 읽는다', () => {
      const old = new SQL.Database();
      old.run(SCHEMA.replace(', pUid TEXT', ''));
      old.run(tx());
      expect(isMmbak(old as unknown as SqlDb)).toBe(true);
      const [row] = parseMmbak(old as unknown as SqlDb).rows;
      expect(row.categoryName).toBe('🍜 식비');
      expect(row.parentName).toBeUndefined();
    });
  });

  describe('수입과 지출', () => {
    /* 이 앱은 지출만 다룬다. 수입은 넣지 않고 건수만 세서 미리보기에서 알린다. */
    it('구분값과 분류 종류가 둘 다 수입이면 넣지 않고 센다', () => {
      const out = parseMmbak(db(tx({ ctg: 'c-pay', doType: 0 }), tx()));
      expect(out.rows).toHaveLength(1);
      expect(out.income).toBe(1);
      expect(out.skipped).toBe(0);
    });

    /* 구분값이 0·1이 아닌 건 이체 같은 것이다. 뜻을 모르는 값을 지출로 치면
       이체가 지출로 들어가 같은 돈이 두 번 센다. */
    it('뜻을 모르는 구분값은 건너뛰고 센다', () => {
      const out = parseMmbak(db(tx({ doType: 3 }), tx()));
      expect(out.rows).toHaveLength(1);
      expect(out.skipped).toBe(1);
      expect(out.income).toBe(0);
    });

    /* 둘이 어긋나면 어느 쪽이 맞는지 모른다. 틀린 방향으로 넣는 것보다
       빼고 알리는 편이 낫다. 수입으로도 세지 않는다 — 수입이라고 확신할 수 없다. */
    it('구분값과 분류 종류가 어긋나면 건너뛰고, 수입으로 세지도 않는다', () => {
      const out = parseMmbak(db(tx({ doType: 1, ctg: 'c-pay' })));
      expect(out.rows).toHaveLength(0);
      expect(out.skipped).toBe(1);
      expect(out.income).toBe(0);
    });
  });

  describe('결제수단 종류', () => {
    const kind = (asset: string) => parseMmbak(db(tx({ asset }))).rows[0].paymentKind;

    it('자산 그룹으로 정한다', () => {
      expect(kind('a-card')).toBe('credit');
      expect(kind('a-chk')).toBe('debit');
      expect(kind('a-cash')).toBe('cash');
      // 은행 계좌에서 나간 돈은 체크카드처럼 바로 빠진다.
      expect(kind('a-bank')).toBe('debit');
    });

    /* 자산을 안 쓰는 사람의 기록은 전부 자산이 비어 있다. 건너뛰면 그 사람은
       한 건도 못 가져온다. 현금으로 두는 건 가정이지만 가장 덜 틀린 가정이다. */
    it('자산이 없는 기록은 현금으로 둔다', () => {
      const [row] = parseMmbak(db(tx({ asset: 'ghost' }))).rows;
      expect(row.paymentKind).toBe('cash');
      expect(row.paymentName).toBe('현금');
    });
  });

  describe('할부', () => {
    const inst = (n: number) =>
      tx({ content: '이어폰', str: `(${n}/3)`, divUid: 'D1', money: '200000.0', ms: MS + n * 86_400_000 * 31 });

    it('(n/m)과 묶음 ID로 할부를 읽는다', () => {
      const { rows } = parseMmbak(db(inst(1), inst(2), inst(3)));
      expect(rows.map((r) => r.installment?.no)).toEqual([1, 2, 3]);
      expect(rows.every((r) => r.installment?.months === 3)).toBe(true);
      // 묶음 ID가 적혀 있으니 이름이나 카드로 짐작하지 않는다.
      expect(new Set(rows.map((r) => r.installment?.groupKey)).size).toBe(1);
    });

    it('이름은 회차 표기 없이 그대로 둔다', () => {
      expect(parseMmbak(db(inst(1))).rows[0].label).toBe('이어폰');
    });

    it('할부가 아닌 기록에는 할부 정보가 없다', () => {
      expect(parseMmbak(db(tx())).rows[0].installment).toBeUndefined();
    });
  });

  describe('못 읽는 줄', () => {
    it('금액이 없거나 0인 줄은 건너뛴다', () => {
      const out = parseMmbak(db(tx({ money: '0.0' }), tx({ money: 'abc' }), tx()));
      expect(out.rows).toHaveLength(1);
      expect(out.skipped).toBe(2);
    });

    /* ZDATE가 비면 Number(null)이 0이라 1970-01-01로 들어갔다. */
    it('날짜가 비었거나 0이면 건너뛴다', () => {
      const none = tx().replace(`'${MS}'`, 'NULL');
      const out = parseMmbak(db(none, tx({ ms: 0 }), tx()));
      expect(out.rows).toHaveLength(1);
      expect(out.skipped).toBe(2);
    });

    /* 원은 소수 단위가 없다. 소수가 있으면 다른 통화이거나 깨진 값이다.
       12.5를 13원으로 반올림해 넣으면 틀린 기록이 조용히 생긴다. */
    it('소수 금액과 앱이 받는 최대 금액을 넘는 금액은 건너뛴다', () => {
      const out = parseMmbak(db(tx({ money: '12.5' }), tx({ money: '100000000000.0' }), tx()));
      expect(out.rows).toHaveLength(1);
      expect(out.skipped).toBe(2);
    });

    it('내역이 비면 분류명(이모지 뗀)을 이름으로 쓴다', () => {
      expect(parseMmbak(db(tx({ content: '' }))).rows[0].label).toBe('식비');
    });
  });
});
