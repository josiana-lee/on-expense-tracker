import { describe, expect, it } from 'vitest';

import { db } from '../db';
import { addExpense } from '../expenses';
import { bootstrap } from '../seed';
import {
  findImportedFile,
  fingerprintOf,
  forgetImportedFile,
  rememberImportedFile,
  type ImportedFile,
} from './imported';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

/** 이 가져오기에서 들어온 것처럼 보이는 기록 하나. */
async function rowFrom(importId: string) {
  const id = await addExpense({ amount: 1000, categoryId: 'food', paymentMethodId: 'cash', importId });
  return id;
}

const entry = (over: Partial<ImportedFile> = {}): ImportedFile => ({
  hash: 'h1',
  importId: 'imp-1',
  at: 1_700_000_000_000,
  count: 3,
  createdPaymentIds: [],
  ...over,
});

describe('fingerprintOf', () => {
  /* 이름이나 날짜가 아니라 내용을 본다. 다운로드 폴더의 "파일 (1).csv"는 같은 파일이다. */
  it('같은 내용은 같은 지문이다', async () => {
    expect(await fingerprintOf(bytes('a,b\n1,2'))).toBe(await fingerprintOf(bytes('a,b\n1,2')));
  });

  it('내용이 한 글자라도 다르면 다른 지문이다', async () => {
    expect(await fingerprintOf(bytes('a,b\n1,2'))).not.toBe(await fingerprintOf(bytes('a,b\n1,3')));
  });

  it('SHA-256 16진수 64자다', async () => {
    expect(await fingerprintOf(bytes('x'))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('가져온 파일 기억', () => {
  it('가져왔고 기록이 남아 있으면 찾는다', async () => {
    await bootstrap();
    await rowFrom('imp-1');
    await rememberImportedFile(entry());

    expect(await findImportedFile('h1')).toMatchObject({ importId: 'imp-1', count: 3 });
  });

  it('처음 보는 파일은 없다', async () => {
    await bootstrap();
    expect(await findImportedFile('nope')).toBeNull();
  });

  /* 되돌리기는 항목을 치우지만, 복원이나 직접 지우기로 기록이 사라진 경우엔 항목만
     남는다. 그걸로 막으면 이미 없는 기록을 "이미 있다"고 우기는 셈이다. */
  it('기록이 이미 없으면 이미 가져온 파일로 치지 않는다', async () => {
    await bootstrap();
    await rememberImportedFile(entry());
    expect(await findImportedFile('h1')).toBeNull();
  });

  it('되돌린 파일은 다시 가져올 수 있다', async () => {
    await bootstrap();
    await rowFrom('imp-1');
    await rememberImportedFile(entry());
    await forgetImportedFile('imp-1');

    expect(await findImportedFile('h1')).toBeNull();
  });

  it('같은 파일을 두 번 가져왔으면 기록이 남은 쪽을 찾는다', async () => {
    await bootstrap();
    await rowFrom('imp-2');
    await rememberImportedFile(entry({ importId: 'imp-1', at: 1 }));
    await rememberImportedFile(entry({ importId: 'imp-2', at: 2 }));

    expect((await findImportedFile('h1'))?.importId).toBe('imp-2');
  });

  it('지문 없이 남긴 항목은 지문으로 찾히지 않는다', async () => {
    await bootstrap();
    await rowFrom('imp-1');
    await rememberImportedFile({ importId: 'imp-1', at: 1, count: 1, createdPaymentIds: ['c1'] });

    expect(await findImportedFile('h1')).toBeNull();
    expect((await db.meta.get('importedFiles'))?.value).toHaveLength(1);
  });

  it('오래된 것부터 버려서 쉰 개까지만 둔다', async () => {
    await bootstrap();
    for (let i = 0; i < 52; i++) {
      await rememberImportedFile(entry({ hash: `h${i}`, importId: `imp-${i}`, at: i }));
    }
    const kept = (await db.meta.get('importedFiles'))?.value as ImportedFile[];
    expect(kept).toHaveLength(50);
    expect(kept[0].importId).toBe('imp-2');
  });

  /* 복원한 백업에서 올 수 있는 값이다. 모양이 틀려도 앱이 죽으면 안 된다. */
  it('망가진 값은 없는 것으로 읽는다', async () => {
    await bootstrap();
    await db.meta.put({ key: 'importedFiles', value: 'oops' as never, updatedAt: 1 });
    expect(await findImportedFile('h1')).toBeNull();
    await rememberImportedFile(entry());
    expect(((await db.meta.get('importedFiles'))?.value as unknown[]).length).toBe(1);
  });
});
