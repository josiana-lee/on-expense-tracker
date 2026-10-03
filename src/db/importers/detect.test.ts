import { beforeEach, describe, expect, it, vi } from 'vitest';

import { detectFile, UnknownFileError, UnreadableFileError } from './detect';
import { openSqlite, SqliteLoadError } from './sqlite';

/* sql.js 자체는 mmbak.test가 실제 wasm으로 검증한다. 여기서는 어떤 파일이 어느
   길로 가는지, 그리고 오류가 사용자에게 무엇이라고 말하는지만 본다. */
vi.mock('./sqlite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sqlite')>()),
  openSqlite: vi.fn(),
}));

const HEAD = '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모';
const csv = (...lines: string[]) =>
  new File([[HEAD, ...lines].join('\n')], 'a.csv', { type: 'text/csv' });

describe('detectFile', () => {
  beforeEach(() => {
    vi.mocked(openSqlite).mockReset();
  });

  it('우리 백업은 내용을 들고 오지 않고 종류만 알려준다', async () => {
    const out = await detectFile(new File(['{"formatVersion":1}'], 'backup.json'));
    expect(out).toEqual({ kind: 'backup' });
  });

  it('확장자와 상관없이 내용으로 알아본다', async () => {
    const out = await detectFile(new File(['{"formatVersion":1}'], 'backup.txt'));
    expect(out.kind).toBe('backup');
  });

  it('CSV는 헤더로 알아보고 읽는다', async () => {
    const out = await detectFile(csv('내 가계부,2026-01-01,지출,"1,000",식비,,김밥,현금,현금,'));
    expect(out.kind).toBe('import');
    if (out.kind === 'import') expect(out.parse.rows).toHaveLength(1);
  });

  /* 헤더 한 줄을 보려고 파일 전체를 파싱하던 때가 있었다. 첫 줄 뒤의 내용이
     어떻든 판별은 헤더만으로 끝나야 한다. */
  it('헤더만 맞으면 첫 줄 뒤의 내용에 상관없이 CSV로 간다', async () => {
    const out = await detectFile(csv('"안 닫힌 따옴표'));
    expect(out.kind).toBe('import');
  });

  it('모르는 CSV는 거절한다', async () => {
    await expect(detectFile(new File(['a,b\n1,2'], 'x.csv'))).rejects.toBeInstanceOf(
      UnknownFileError,
    );
  });

  it('빈 파일은 거절한다', async () => {
    await expect(detectFile(new File([], 'empty.csv'))).rejects.toThrow('빈 파일');
  });

  /* 안드로이드 파일 선택기는 아무 파일이나 고르게 둔다. 읽기 전에 돌려보내지
     않으면 동영상 하나가 WebView를 죽인다. 크기만 보고 거절하므로 내용은 필요 없다. */
  it('너무 큰 파일은 읽기 전에 거절한다', async () => {
    const big = new File(['x'], 'movie.mp4');
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    const slice = vi.spyOn(big, 'slice');

    await expect(detectFile(big)).rejects.toThrow('너무 커');
    expect(slice).not.toHaveBeenCalled();
  });

  describe('SQLite', () => {
    const sqliteFile = () =>
      new File(['SQLite format 3\0' + 'x'.repeat(100)], 'MM.mmbak');

    it('SQLite는 확장자가 아니라 첫 열여섯 바이트로 알아본다', async () => {
      vi.mocked(openSqlite).mockRejectedValue(new Error('not a database'));
      await expect(detectFile(sqliteFile())).rejects.toBeInstanceOf(UnreadableFileError);
      expect(openSqlite).toHaveBeenCalledTimes(1);
    });

    it('파일이 안 열리면 깨졌을 수 있다고 말한다', async () => {
      vi.mocked(openSqlite).mockRejectedValue(new Error('file is not a database'));
      await expect(detectFile(sqliteFile())).rejects.toThrow('깨졌을 수 있어');
    });

    /* 도구를 못 불러온 건 파일 탓이 아니다. 멀쩡한 파일을 깨졌다고 하면 사용자는
       파일을 새로 받으러 간다. */
    it('도구를 못 불러온 건 파일 탓으로 말하지 않는다', async () => {
      vi.mocked(openSqlite).mockRejectedValue(new SqliteLoadError());
      const err = await detectFile(sqliteFile()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnreadableFileError);
      expect((err as Error).message).not.toContain('깨졌');
    });
  });
});
