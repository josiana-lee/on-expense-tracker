import { fmt, fmtTime } from '../date';
import type { ImportParse, ImportRow } from './types';
import { MAX_AMOUNT, isRealDate } from './validate';

/** sql.js의 Database 중 우리가 쓰는 부분만. 어댑터가 라이브러리 전체에 기대지
 *  않게 하고, 테스트가 진짜 데이터베이스를 그대로 넘길 수 있게 한다. */
export type SqlDb = {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
};

const SOURCE = 'SQLite';

/** 읽는 표와 열. 이게 다 있으면 이 형식으로 친다.
 *
 *  SQLite 파일이라고 다 같은 앱의 것은 아니다. 표 이름만 보면 비슷한 이름의 다른
 *  표를 읽을 수 있어서 열까지 본다 — 열이 모자란 파일에 쿼리를 던지면 터지고,
 *  그 오류가 "읽을 수 없는 파일"이라는 말로 사용자에게 닿을 길이 없다. */
const REQUIRED: Record<string, string[]> = {
  INOUTCOME: [
    'assetUid', 'ctgUid', 'ZCONTENT', 'ZDATE', 'DO_TYPE', 'ZMONEY', 'IS_DEL',
    'CARD_DIVIDE_MONTH_STR', 'cardDivideUid',
  ],
  ZCATEGORY: ['uid', 'NAME', 'TYPE'],
  ASSETS: ['uid', 'NIC_NAME', 'groupUid'],
  ASSETGROUP: ['uid', 'TYPE'],
};

function columnsOf(db: SqlDb, table: string): Set<string> | null {
  const info = db.exec(`PRAGMA table_info(${table})`)[0];
  if (!info) return null;
  const nameAt = info.columns.indexOf('name');
  return new Set(info.values.map((r) => String(r[nameAt])));
}

export function isMmbak(db: SqlDb): boolean {
  try {
    return Object.entries(REQUIRED).every(([table, cols]) => {
      const have = columnsOf(db, table);
      return have !== null && cols.every((c) => have.has(c));
    });
  } catch {
    return false;
  }
}

/* 자산 그룹의 종류 → 결제수단 종류. 그룹 이름이 아니라 TYPE 번호로 본다 — 이름은
   사용자가 바꿀 수 있다. 모르는 그룹은 체크카드로 친다: 돈이 바로 빠지는 쪽이
   가장 덜 틀리고, 카드 관리에서 바꿀 수 있다. */
const GROUP_CASH = 11;
const GROUP_CREDIT = 2;

function kindOf(groupType: number | null): ImportRow['paymentKind'] {
  if (groupType === GROUP_CASH) return 'cash';
  if (groupType === GROUP_CREDIT) return 'credit';
  return 'debit';
}

const INSTALMENT = /\((\d+)\/(\d+)\)/;

export function parseMmbak(db: SqlDb): ImportParse {
  /* 상위 분류 열(pUid)은 필수로 두지 않는다. 없는 판의 파일이 "알아볼 수 없는 파일"이
     되는 것보다, 상위 없이 하위(또는 최상위) 이름만으로 읽는 편이 낫다. */
  const hasParent = columnsOf(db, 'ZCATEGORY')?.has('pUid') ?? false;
  const res = db.exec(`
    SELECT i.ZDATE, i.ZMONEY, i.DO_TYPE, i.ZCONTENT, i.CARD_DIVIDE_MONTH_STR, i.cardDivideUid,
           c.NAME AS cname, c.TYPE AS ctype, ${hasParent ? 'pc.NAME' : 'NULL'} AS pname,
           a.NIC_NAME AS aname, g.TYPE AS gtype
    FROM INOUTCOME i
    LEFT JOIN ZCATEGORY c ON c.uid = i.ctgUid
    ${hasParent ? 'LEFT JOIN ZCATEGORY pc ON pc.uid = c.pUid' : ''}
    LEFT JOIN ASSETS a ON a.uid = i.assetUid
    LEFT JOIN ASSETGROUP g ON g.uid = a.groupUid
    WHERE COALESCE(i.IS_DEL, 0) = 0
    ORDER BY i.ZDATE`)[0];

  const rows: ImportRow[] = [];
  let skipped = 0;
  let income = 0;
  if (!res) return { source: SOURCE, rows, income, skipped };

  const at = (name: string) => res.columns.indexOf(name);
  const col = {
    date: at('ZDATE'), money: at('ZMONEY'), doType: at('DO_TYPE'), content: at('ZCONTENT'),
    inst: at('CARD_DIVIDE_MONTH_STR'), divUid: at('cardDivideUid'), cname: at('cname'),
    ctype: at('ctype'), pname: at('pname'), aname: at('aname'), gtype: at('gtype'),
  };

  for (const r of res.values) {
    /* ZDATE가 비면 Number(null)이 0이라 1970-01-01로 들어갔다. 0 이하는 날짜가 아니다.
       금액은 반올림하지 않는다 — 원은 소수 단위가 없어서 소수가 있으면 다른
       통화이거나 깨진 값이고, 12.5를 13원으로 넣으면 틀린 기록이 조용히 생긴다. */
    const ms = Number(r[col.date]);
    const amount = Number(r[col.money]);
    if (
      !Number.isFinite(ms) ||
      ms <= 0 ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > MAX_AMOUNT
    ) {
      skipped++;
      continue;
    }

    /* 수입/지출은 구분값과 분류 종류 둘이 같은 말을 할 때만 받는다. 이체 같은
       뜻을 모르는 구분값을 지출로 치면 같은 돈이 두 번 세어지고, 둘이 어긋나면
       어느 쪽이 맞는지 알 길이 없다. 틀린 방향으로 넣느니 빼고 알린다. */
    const doType = Number(r[col.doType]);
    const ctype = r[col.ctype] == null ? NaN : Number(r[col.ctype]);
    const isExpense = doType === 1 && ctype === 1;
    const isIncome = doType === 0 && ctype === 0;
    /* 수입은 넣지 않고 센다(types.ts) — 이 앱은 지출만 다룬다. 구분값은 표본으로
       확인했다: 0은 수입(분류 종류도 0), 1은 지출, 3·4는 이체의 출금·입금이다.
       이체 행에는 분류가 없어서 위의 둘 어디에도 안 걸리고 건너뛴다. 이체 수수료는
       금액 0원인 지출 행이 따로 붙는데 위에서 금액 0으로 걸러진다. */
    if (isIncome) {
      income++;
      continue;
    }
    if (!isExpense) {
      skipped++;
      continue;
    }

    const d = new Date(ms);
    // 로컬 날짜로 바꾼 결과가 앱이 받는 범위인가. 밀리초가 엉뚱하면 여기서 걸린다.
    if (!isRealDate(fmt(d))) {
      skipped++;
      continue;
    }
    const categoryName = String(r[col.cname] ?? '') || '분류 없음';
    // 최상위 분류는 pUid가 '0'이라 짝이 없어 비어 있다.
    const parentName = r[col.pname] == null ? '' : String(r[col.pname]);
    const content = String(r[col.content] ?? '').trim();

    let installment: ImportRow['installment'];
    const m = INSTALMENT.exec(String(r[col.inst] ?? ''));
    if (m && Number(m[2]) >= 2) {
      const months = Number(m[2]);
      const uid = String(r[col.divUid] ?? '');
      installment = {
        // 묶음 ID가 적혀 있으면 그것이 정답이다. 비어 있을 때만 이름으로 짐작한다.
        groupKey: uid || `${content}|${months}|${String(r[col.aname] ?? '')}`,
        no: Number(m[1]),
        months,
      };
    }

    /* 자산이 비어 있으면 현금으로 둔다. 자산을 안 쓰는 사람은 기록 전부가 이렇고,
       건너뛰면 한 건도 못 가져온다. 가정이지만 가장 덜 틀린 가정이다. */
    const assetName = r[col.aname] == null ? '' : String(r[col.aname]);
    const hasAsset = assetName !== '';

    rows.push({
      date: fmt(d),
      time: fmtTime(d),
      amount,
      categoryName,
      ...(parentName ? { parentName } : {}),
      // 내역이 제목이므로 메모 칸에 둔다(우리 입력과 같은 자리). 하위 분류 카테고리 이름은
      // 우리 카테고리와 안 맞아 상위로 묶일 때 plan이 세부항목으로 넣는다.
      memo: content || undefined,
      paymentName: hasAsset ? assetName : '현금',
      paymentKind: hasAsset ? kindOf(r[col.gtype] == null ? null : Number(r[col.gtype])) : 'cash',
      installment,
    });
  }

  return { source: SOURCE, rows, income, skipped };
}
