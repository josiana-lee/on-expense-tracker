import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { CategoryRecord, PaymentMethodRecord } from '../db/types';

/** Categories and payment methods together stay under ~40 rows, so they are
 *  read whole and sorted in memory rather than through indexes.
 *
 *  Two kinds of list come out of here and the difference matters: the pickers
 *  offer only what the user can choose right now, while the lookup maps hold
 *  everything ever created. Archiving is how a category or card is retired —
 *  records from before still point at it, and dropping it from the maps would
 *  turn three-year-old entries into blank rows. */
export function useCatalog() {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const payments = useLiveQuery(() => db.paymentMethods.toArray(), []);

  return useMemo(() => {
    const allCats = (categories ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    const allPays = (payments ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

    const selectableCats = allCats.filter((c) => !c.archived);

    return {
      /** Selectable in the category management screen. */
      categories: selectableCats,
      /** The 12-ish icons on the input grid. */
      homeCategories: selectableCats.filter((c) => c.visibleOnHome && !c.deprecated),
      /** Selectable as payment chips. */
      payments: allPays.filter((p) => !p.archived),
      /** Lookups for rendering stored records — archived entries included. */
      byId: new Map<string, CategoryRecord>(allCats.map((c) => [c.id, c])),
      paymentById: new Map<string, PaymentMethodRecord>(allPays.map((p) => [p.id, p])),
      loading: categories === undefined || payments === undefined,
    };
  }, [categories, payments]);
}
