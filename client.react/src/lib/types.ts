import ApolloClient from 'apollo-client';

export type TxnTypes =
  | 'banktxn'
  | 'accountTransfer'
  | 'envelopeTransfer'
  | 'fill';
export interface ITransaction {
  id: string;
  user_id: string;
  memo: string;
  date: string;
  amount: number;
  label: string | null;
  type: TxnTypes;
  txn_id: string;
  from_id: string;
  to_id: string;
}

export interface Envelope {
  id: string;
  user_id: string;
  name: string;
  type: 'envelope';
  extra: {
    due: Date | null;
    target: number;
    interval:
      | 'total'
      | 'weekly'
      | 'biweekly'
      | 'bimonthly'
      | 'monthly'
      | 'annually';
  };
  tags: { [key: string]: string };
}

export interface BankAccount {
  id: string;
  user_id: string;
  name: string;
  type: 'account';
  extra: {};
}

export type IAccount = Envelope | BankAccount;

export interface TxnGrouped {
  to_names: string;
  to_ids: string;
  amount: number;
  txn_id: string;
  user_id: string;
  label: string | null;
  date: string;
  memo: string;
  type: string;
  from_id: string;
  from_name: string;
}

export interface Balance {
  id: string;
  user_id: string;
  name: string;
  type: string;
  extra: { [key: string]: any };
  balance: number;
}

export interface GraphqlParams {
  userId: string;
  apikey: string;
  apollo: ApolloClient<any>;
}

export function isBankAccount(account: IAccount): account is BankAccount {
  return account.type === 'account';
}

export function isEnvelope(account: IAccount): account is Envelope {
  return account.type === 'envelope';
}