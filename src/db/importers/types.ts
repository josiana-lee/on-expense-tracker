import type { DateStr, TimeStr, TxType } from '../types';

/** 어떤 가계부에서 왔든 이 모양으로 바꾼 뒤에 공통 경로를 탄다.
 *
 *  여기까지가 "읽기"고 그 뒤가 "앉히기"다. 앱마다 다른 건 파일을 이 모양으로
 *  바꾸는 부분뿐이고, 분류를 짝짓고 할부를 묶고 기록을 만드는 일은 한 벌만
 *  있다 — 두 번째 앱부터 매핑 표 하나로 끝나는 이유다.
 *
 *  카테고리와 결제수단은 **이름 그대로** 들고 온다. 여기서 우리 id로 바꾸지
 *  않는 이유는, 무엇을 무엇에 짝지을지는 사용자가 미리보기에서 정하기
 *  때문이다 — 읽는 쪽이 멋대로 정하면 그 결정이 화면에 보이지 않는다. */
export type ImportRow = {
  date: DateStr;
  /** 원본에 시각이 있으면. 없으면 비워두고, 커밋이 00:00으로 채운다. */
  time?: TimeStr;
  /** 원 단위 정수. 쉼표·통화 기호는 읽는 쪽에서 이미 떼어냈다. */
  amount: number;
  type: TxType;
  /** 원본 앱의 분류명. 우리 카테고리 id가 아니다. */
  categoryName: string;
  /** 기록에 보일 이름. 원본의 "내역"에 해당한다. */
  label?: string;
  memo?: string;
  /** 원본 앱의 결제수단 이름. */
  paymentName: string;
  paymentKind: 'cash' | 'credit' | 'debit';
  /** 할부 회차라면. groupKey는 같은 결제에서 나온 행끼리 같은 값이어야
   *  하고, 그 안에서 no가 1..months로 채워지면 한 묶음으로 복원된다. */
  installment?: { groupKey: string; no: number; months: number };
};

/** 파일 하나를 읽은 결과. */
export type ImportParse = {
  /** 화면에 보일 출처 이름. "위플 가계부" 처럼. */
  source: string;
  rows: ImportRow[];
  /** 읽다가 버린 줄 수. 0이 아니면 미리보기에서 말해준다 — 조용히 버리면
   *  사용자는 건수가 왜 모자란지 알 수 없다. */
  skipped: number;
};
