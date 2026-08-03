/* Payment methods seeded on first run. Cards become user-editable in the
   settings screen; 현금 is always present.

   Only 3 starter cards ship (2026-08-03) — real card add/rename/archive now
   exists (db/paymentMethods.ts), so guessing at someone's actual bank lineup
   (issuer, credit vs check) isn't worth doing anymore. These exist so the
   input screen isn't empty on first launch, not as a real card list.

   Credit cards ship without a statement period on purpose — every issuer
   uses a different one, so guessing produces wrong 결제/미결제 splits. The
   card settings screen asks for it, defaulting to the conventional window. */

import type { PaymentKind } from '../db/types';

export type PresetPayment = {
  key: string;
  name: string;
  kind: PaymentKind;
  tag: string;
  colorHex: string;
  sortOrder: number;
};

export const PRESET_PAYMENTS: readonly PresetPayment[] = [
  { key: 'cash', name: '현금', kind: 'cash', tag: '현', colorHex: '#FFE0A0', sortOrder: 10 },
  { key: 'hyundai', name: '현대카드', kind: 'credit', tag: '현', colorHex: '#C0B6F4', sortOrder: 20 },
  { key: 'samsung', name: '삼성카드', kind: 'credit', tag: '삼', colorHex: '#FFB9AC', sortOrder: 30 },
  { key: 'check', name: '체크카드', kind: 'debit', tag: '체', colorHex: '#9BDCD6', sortOrder: 40 },
];
