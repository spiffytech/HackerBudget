import format from 'date-fns/format';
import add from 'lodash/fp/add';
import curry from 'lodash/fp/curry';
import flatten from 'lodash/fp/flatten';
import groupBy from 'lodash/fp/groupBy';
import uniq from 'lodash/fp/uniq';
import * as shortid from 'shortid';

import {DETxn} from './types';
export {DETxn} from './types';

export type Dollars = number & {_type: 'dollars'};
export type Pennies = number & {_type: 'pennies'};

export interface TxnItem {
  account: string;
  amount: Pennies;
}

export interface EnvelopeEvent {
  name: string;
  id: string;
  amount: Pennies;
}

export interface LedgerEvent {
  _id: string;
  date: string;
  amount: Pennies;
  memo: string;
}
export interface EnvelopeTransfer extends LedgerEvent {
  from: EnvelopeEvent;
  to: EnvelopeEvent[];
  type: 'envelopeTransfer';
}

export interface BankTxn extends LedgerEvent {
  account: string;
  accountId: string;
  payee: string;
  categories: EnvelopeEvent[];
  type: 'banktxn';
}

export interface AccountTransfer extends LedgerEvent {
  from: string;
  to: string;
  fromId: string;
  toId: string;
  txfrId: string;
  type: 'accountTransfer';
}

export type Txn = BankTxn | AccountTransfer | EnvelopeTransfer;

export interface BankTxnFriendly extends BankTxn {
  accountName: string;
  categoryNames: {[key: string]: Pennies};
}

export interface AccountTransferFriendly extends AccountTransfer {
  fromName: string;
  toName: string;
}

export interface EnvelopeTransferFriendly extends EnvelopeTransfer {
  fromName: string;
  toName: string;
}

export type TxnFriendly = BankTxnFriendly | AccountTransferFriendly | EnvelopeTransferFriendly;

export interface Balance {
  name: string;
  balance: Pennies;
}

export interface Account {
  _id: string;
  name: string;
  type: 'account';
}

export interface Category {
  name: string;
  target: Pennies;
  interval: 'weekly' | 'monthly' | 'yearly' | 'once';
  due?: string;
  type: 'category';
  _id: string;
}

export function learnAccountsFromTxns(txns: DETxn[]): string[] {
  return flatten(
    uniq(flatten(txns.map((txn) => Object.keys(txn.items)))).
    map((account) => {
      const splits = account.split(':');
      const ret = [];
      for (let i = 1; i <= splits.length; i++) {
        ret.push(account.split(':', i).join(':'));
      }
      return ret;
    }),
  );
}

/**
 * Returns TxnItems for each bank-touching transaction, including separate
 * TxnItems for each side of an account transfer
 */
export function journalToLedger(txns: Txn[]): TxnItem[] {
  return flatten(txns.filter(touchesBank).map(accountsForTxn));
}

export function accountsForTxn(txn: BankTxn | AccountTransfer): TxnItem[] {
  if (txn.type === 'banktxn') return [{account: txn.account, amount: txn.amount}];

  return [
    {account: txn.from, amount: txn.amount},
    {account: txn.to, amount: -txn.amount as Pennies},
  ];
}

export function categoriesForTxn(txn: BankTxn | EnvelopeTransfer): TxnItem[] {
  if (isBankTxn(txn)) {
    return (
      txn.categories.
      map(({name, amount}): TxnItem =>
        ({account: name, amount}),
      )
    );
  } else if (isEnvelopeTxfr(txn)) {
    return [
      {account: txn.from.name, amount: txn.amount},
      ...txn.to.map(({name, amount}) => ({account: name, amount})),
    ];
  }
  const n: never = txn;
  return n;
}

export function isBankTxn(txn: Txn): txn is BankTxn {
  return txn.type === 'banktxn';
}

export function isAccountTxfr(txn: Txn): txn is AccountTransfer {
  return txn.type === 'accountTransfer';
}

export function isEnvelopeTxfr(txn: Txn): txn is EnvelopeTransfer {
  return txn.type === 'envelopeTransfer';
}

/**
 * Used in CouchDB views, so be careful about what goes in herer
 */
export function touchesBank(txn: Txn): txn is BankTxn | AccountTransfer {
  switch (txn.type) {
    case 'banktxn': return true;
    case 'accountTransfer': return true;
    case 'envelopeTransfer': return false;
    default:
      const n: never = txn;
      return n;
  }
}

export function hasCategories(txn: Txn): txn is BankTxn | EnvelopeTransfer {
  switch (txn.type) {
    case 'banktxn': return true;
    case 'envelopeTransfer': return true;
    case 'accountTransfer': return false;
    default:
      const n: never = txn;
      return n;
  }
}

export const touchesAccount = curry((account: string, txn: Txn): boolean => {
  if (isEnvelopeTxfr(txn)) return false;
  if (isBankTxn(txn)) return txn.account === account;
  return txn.from === account || txn.to === account;
});

export function formatDate(date: string) {
  return format(date, 'YYYY-MM-DD');
}

export function penniesToDollars(pennies: Pennies): Dollars {
  return pennies / 100 as Dollars;
}

export function dollarsToPennies(dollars: Dollars): Pennies {
  return Math.round(dollars * 100) as Pennies;
}

export function stringToPennies(str: string): Pennies {
  return parseInt(str.replace('.', ''), 10) as Pennies;
}

function balancesFromTxnItems(items: Array<[string, TxnItem[]]>): Balance[] {
  return (
    items.map(([account, txnItems]): Balance =>
      ({
        balance: txnItems.map((item) => item.amount as number).reduce(add) as Pennies,
        name: account,
      }),
    )
  );
}

export function accountBalances(txns: Txn[]): Balance[] {
  const groups = groupBy(
    (txnItem) => txnItem.account,
    journalToLedger(Array.from(txns)),
  );

  return balancesFromTxnItems(Object.entries(groups));
}

export function categoryBalances(txns: Txn[]): Balance[] {
  const ledger = flatten(
    Array.from(txns).
      filter(hasCategories).
      map(categoriesForTxn),
  );
  const groups = groupBy(
    (txnItem) => txnItem.account,
    ledger,
  );

  return balancesFromTxnItems(Object.entries(groups));
}

export function idForCategoryName(name: string) {
  return `category-${name}`;
}

export function idForAccountName(name: string) {
  return `account-${name}`;
}

export function idForBankTxn(date: Date, payee: string): string {
  return ['txn', date.toISOString(), 'banktxn', payee, shortid.generate()].join('/');
}

const ZeroBankTxn: BankTxn = {
  _id: '',
  date: '',
  amount: 0 as Pennies,
  memo: '',
  account: '',
  accountId: '',
  payee: '',
  categories: [],
  type: 'banktxn',
};

export const Zero = {
  BankTxn: ZeroBankTxn,
};
