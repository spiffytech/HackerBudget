import * as shortid from 'shortid';

import Amount from './Amount';
import BucketAmount from './BucketAmount';
import BucketReference from './BucketReference';
import {BankTxn as ClassicBankTxn} from './txns';
import * as Txns from './txns';
import {EnvelopeEvent, TxnExport} from './types';
import * as utils from './utils';

interface BTData {
  _id: string | null;
  date: Date;
  memo: string;
  payee: string;
  from: BucketReference;
  categories: EnvelopeEvent[];
  type?: string;
  // Legacy POJO values that we can ignore
  amount?: number | Txns.Pennies;
  account?: string;
  accountId?: string;
}

export default class BankTxn {
  public static POJO(txn: ClassicBankTxn) {
    return new BankTxn({
      ...txn,
      date: new Date(txn.date),
      categories: txn.categories.map((category) =>
        ({...category, amount: Amount.Pennies(category.amount)}),
      ),
      from: BucketReference.POJO({name: txn.account, id: txn.accountId, type: 'account'}),
    });
  }

  public static Empty() {
    return new BankTxn({
      _id: null,
      date: new Date(),
      memo: '',
      payee: '',
      from: BucketReference.Empty('account'),
      categories: [],
    });
  }

  public date: Date;
  public from: BucketReference;
  public memo: string;
  public payee: string;
  private _id: string | null;
  private _categories: EnvelopeEvent[] = [];

  private _debitMode = false;

  protected constructor(data: BTData) {
    this._id = data._id;
    this.payee = data.payee;
    this.from = data.from;
    this.date = data.date;
    this.memo = data.memo;
    this._categories = data.categories;
  }

  public toPOJO(): ClassicBankTxn {
    return {
      _id: this.id,
      date: this.date.toJSON(),
      amount: this.amount.pennies as Txns.Pennies,
      payee: this.payee,
      account: this.from.name,
      accountId: this.from.id,
      memo: this.memo,
      categories: this._categories.map((category) =>
        ({...category, amount: category.amount.pennies as Txns.Pennies}),
      ),
      type: 'banktxn',
    };
  }

  public export(): TxnExport {
    return {
      date: this.date,
      amount: this.amount,
      from: this.categories.map((category) => category.name).join('||'),
      to: this.payee,
      memo: this.memo,
      type: 'banktxn',
    };
  }

  get amount(): Amount {
    const pennies = (
      this._categories.
      map((category) => category.amount.pennies).
      reduce((a, b) => a + b, 0)
    );

    return Amount.Pennies(pennies);
  }

  get categories() {
    return this._categories;
  }

  get dateString() {
    return utils.formatDate(this.date);
  }

  set dateString(d: string) {
    this.date = new Date(d);
  }

  get id() {
    return (
      this._id  ||
      ['txn', utils.formatDate(this.date), 'banktxn', this.payee, shortid.generate()].join('/')
    );
  }

  public addCategory(event: EnvelopeEvent) {
    this._categories.push(event);
  }

  public removeZeroCategories() {
    this._categories = this._categories.filter(
      ({amount}) => amount.pennies !== 0,
    );
  }

  get debitMode() {
    return this._debitMode;
  }

  set debitMode(b: boolean) {
    if (this._debitMode !== b) {
      this._categories = this._categories.map((category) =>
        ({...category, amount: Amount.Pennies(category.amount.pennies * -1)}),
      );
    }
    this._debitMode = b;
  }

  public errors(): string[] | null {
    const errors = [
      !this.payee && 'Payee is missing',
      !this.from.name && 'Account is missing',
      !this.from.id && 'Program error: Account ID did not get set',
      this.categories.length === 0 && 'You must include at least one category',
      this.categories.filter((category) => category.amount.pennies === 0).length > 0 &&
        'All categories must have a non-zero balance',
    ].filter(utils.isString);
    return errors.length > 0 ? errors : null;
  }
}
