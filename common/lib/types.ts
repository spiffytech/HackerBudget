export type TxnTypes = 'banktxn' | 'accountTransfer' | 'envelopeTransfer' | 'fill';
export interface ITransaction {
  id: string;
  user_id: string;
  memo: string;
  date: Date;
  amount: number;
  label: string | null;
  type: TxnTypes;
  txn_id: string;
  from_id: string;
  to_id: string;
}

export interface IAccount {
  id: string;
  user_id: string;
  name: string;
  type: string;
  extra: any;
}

export interface TxnGrouped {
  to_names: string;
  to_ids: string;
  amount: number;
  txn_id: string;
  user_id: string;
  label: string;
  date: string;
  memo: string;
  type: string;
  from_id: string;
  from_name: string;
}
