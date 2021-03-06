import immer from 'immer';
import {get as storeGet} from 'svelte/store';

export default async function saveTransactions(
  { transactionsStore },
  dexie,
  txnGroupId
) {
  const toDelete = storeGet(transactionsStore).filter(txn => txn.txn_id === txnGroupId);
  await Promise.all(toDelete.map(txn => dexie.transactions.delete(txn.id)));

  transactionsStore.update($transactions =>
    immer(
      $transactions,
      draft => draft.filter(txn => txn.txn_id !== txnGroupId)
    )
  );
}
