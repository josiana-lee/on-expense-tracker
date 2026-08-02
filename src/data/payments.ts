/* Payment methods the input screen offers as chips. Cards become
   user-editable in the settings screen; 현금 is always present. */

export type PaymentMethod = {
  id: string;
  name: string;
  kind: 'cash' | 'credit' | 'debit';
};

export const DEFAULT_PAYMENTS: PaymentMethod[] = [
  { id: 'cash', name: '현금', kind: 'cash' },
  { id: 'hyundai', name: '현대카드', kind: 'credit' },
  { id: 'samsung', name: '삼성카드', kind: 'credit' },
  { id: 'kb', name: '국민카드', kind: 'credit' },
  { id: 'lotte', name: '롯데카드', kind: 'credit' },
  { id: 'check', name: '체크카드', kind: 'debit' },
];
