import {RouteComponentProps} from 'react-router-dom';
import React, {useEffect, useState} from 'react';
import * as shortid from 'shortid';

import '../lib/core.css';
import styles from './FillEnvelopes.module.css';
import {AuthStore, FlashStore} from '../store';
import * as Balances from '../lib/Balances';
import {Intervals} from '../lib/Accounts';
import * as ITransactions from '../lib/ITransactions';
import {toDollars} from '../lib/pennies';

export default function FillEnvelopes(props: RouteComponentProps<{txnId?: string}>) {
  interface Fill {envelopeId: string; amount: number; envelope: Balances.BalanceEnvelope}
  const [fills, setFills] = useState<Fill[]>([]);
  const [interval, setInterval] = useState<Intervals>('weekly');

  function setError(msg: string) {
    FlashStore.flash = msg;
    FlashStore.type === 'error';
  }

  useEffect(() => {
    if (!AuthStore.loggedIn) throw new Error('User must be logged in');
    Balances.loadBalancess(AuthStore.userId, AuthStore.apiKey).
    then(({data}) => {
      const newFills =
        data.balances.
        filter((balance) => Balances.isBalanceEnvelope(balance)).
        map((balance) => ({
          envelopeId: balance.id,
          amount: 0,
          envelope: balance as Balances.BalanceEnvelope, // We can cast this becasue of the filter
        }));
      setFills(newFills);

      if (!props.match.params.txnId) return;
      if (!AuthStore.loggedIn) throw new Error('User must be logged in');
      // Load a prior fill
      return (
        ITransactions.loadTransaction(AuthStore.userId, AuthStore.apiKey, props.match.params.txnId).
        then(({data}) => {
          if (data.transactions.length === 0) {
            props.history.push('/404');
            return;  // 404
          }

          console.log(data.transactions);
          setFills(newFills.map((fill) => {
            const priorFill = data.transactions.find((txn) => txn.to_id === fill.envelopeId);
            if (priorFill) {
              return {
                envelopeId: fill.envelopeId,
                amount: priorFill.amount,
                envelope: fill.envelope
              };
            }
            return fill;
          }));
        }).catch((ex) => setError(ex.message))
      );
    }).catch((ex) => setError(ex.message));
  }, [props.match.params.txnId]);

  if (fills.length === 0) return <p>Loading...</p>;

  const unallocated = fills.find(({envelope}) => envelope.name === '[Unallocated]');
  if (!unallocated) throw new Error('You don\'t have an [Unallocated] category!');

  function fillEnvelope(fill: Fill, amount: number) {
    return function fn(event: React.FormEvent<any>) {
      event.preventDefault();
      setFills(fills.map((f) => {
        if (fill !== f) return f;
        return {...f, amount}
      }));
    }
  }

  async function handleSubmit(event: React.FormEvent<any>) {
    event.preventDefault();
    const txnId = props.match.params.txnId || shortid.generate();
    if (!AuthStore.userId) throw new Error('User must be logged in');
    const txns: ITransactions.T[] = fills.map((fill, i) => {
      if (!AuthStore.userId) throw new Error('User must be logged in');
      const txn: ITransactions.T = {
        id: shortid.generate(),
        user_id: AuthStore.userId,
        memo: '',
        date: new Date(),
        amount: Math.round(fill.amount),
        label: null,
        type: 'fill',
        txn_id: txnId,
        from_id: unallocated!.envelope.id,
        to_id: fill.envelope.id,
      };
      return txn;
    }).filter((txn) => txn.amount !== 0);

    await ITransactions.deleteTransactions(AuthStore.userId, AuthStore.apiKey, txnId);
    await ITransactions.saveTransactions(AuthStore.userId, AuthStore.apiKey, txns);
    props.history.push('/');
  }

  function sumOfFills() {
    return fills.map((fill) => fill.amount).reduce((acc, item) => acc + item, 0);
  }

  async function deleteTransaction(event: React.MouseEvent<any>) {
    event.preventDefault();
    if (!props.match.params.txnId) {
      throw new Error('Shouldn\'t be inside delete handler without a txn to delete');
    }
    if (!AuthStore.loggedIn) throw new Error('User must be logged in');
    await ITransactions.deleteTransactions(
      AuthStore.userId, AuthStore.apiKey, props.match.params.txnId
    );
    props.history.push('/');
  }

  return (
    <div className={`flex justify-around content`}>
      <form onSubmit={handleSubmit} className='bg-white p-4 rounded border border-2 border-grey-light m-4'>
        <p>Unallocated: {toDollars(unallocated.envelope.balance - sumOfFills())}</p>

        <select
          value={interval}
          onChange={(event) => setInterval(event.target.value as Intervals)}
        >
          <option value='weekly'>Weekly</option>
          <option value='biweekly'>Biweekly</option>
          <option value='monthly'>Monthly</option>
          <option value='annually'>Annually</option>
        </select>

        <>
          {fills.filter((fill) => fill.envelope.name !== '[Unallocated]').map((fill) =>
            <div key={fill.envelope.id} className='flex justify-between bubble'>
              <div>
                <div>{fill.envelope.name}</div>
                {props.match.params.txnId ? null :
                <>
                  <button
                    onClick={fillEnvelope(fill, Balances.calcAmountForPeriod(fill.envelope)[interval])}
                  >
                    Fill {toDollars(Balances.calcAmountForPeriod(fill.envelope)[interval])}
                  </button>
                  <button onClick={fillEnvelope(fill, -fill.envelope.balance)}>Set to 0</button>
                </>
                }
              </div>
              <div>
                <div>Balance: {toDollars(fill.envelope.balance)}</div>
                <span>Fill:</span> <input
                  type='number'
                  step='0.01'
                  value={fill.amount / 100}
                  onChange={(event) => fillEnvelope(fill, Math.round(parseFloat(event.target.value) * 100))(event)}
                  className='w-32 border'
                />
                <div><div>New Balance:</div>{toDollars(fill.envelope.balance + fill.amount)}</div>
              </div>
            </div>
          )}
      </>

        {props.match.params.txnId ? <button onClick={deleteTransaction}>Delete Transaction</button> : null }

        <input type='submit' value='Fill!' />
      </form>
    </div>
  )
}
