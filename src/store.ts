import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';

import * as bacon from 'baconjs';
import { action, autorun, computed, configure as mobxConfigure, observable, runInAction} from 'mobx';
import * as R from 'ramda';

import * as Couch from './lib/couch';
import {pushRoute} from './lib/router';
import * as Txns from './lib/txns';
import * as Types from './lib/types';
import * as Views from './lib/Views';

mobxConfigure({ enforceActions: true });

/* tslint:disable:no-console */

class Store {
  @observable public email: string | null = null;
  @observable public txns: Map<string,Txns.Txn> = new Map();
  @observable public db: firebase.firestore.DocumentReference | null = null;

  @observable public visibleTxnsOffset = 0;

  public dbC: PouchDB.Database;
  public remoteDB?: PouchDB.Database;
  public pouchReplicator?: PouchDB.Replication.Sync<{}> = undefined;
  @observable public username: string | null = null;

  @observable public currentView: Views.All = {name: 'home'};

  private visibleTxnsPerPage = 20;

  constructor(local: PouchDB.Database) {
    this.dbC = local;

    autorun(async () => {
      if (this.username) {
        console.log('Logged in')
        this.remoteDB = await Couch.mkRemoteDB(this.username);
        this.pouchReplicator = Couch.syncDBs(this.dbC, this.remoteDB!);
      } else {
        this.remoteDB = undefined;
        if (this.pouchReplicator) this.pouchReplicator.cancel();
      }
    });

    autorun(() => {
      const path = this.urlPath;
      if (path !== window.location.pathname) pushRoute(path);
    })
  }

  public async init() {
    const session = await Couch.getSession();
    if (session.userCtx.name === null) {
      console.log('No user session');
      return;
    }
    this.remoteDB = Couch.mkRemoteDB(session.userCtx.name);
    runInAction(() => {
      console.log();
      this.username = session.userCtx.name;
    });
    await this.subscribeTxns();
  }

  @computed
  get visibleTxns(): Txns.Txn[] {
    const txns = Array.from(this.txns.values());
    const start = Math.max(0, Math.min(this.visibleTxnsOffset, txns.length - this.visibleTxnsPerPage))
    return (
      txns.
      sort((a, b) => a.date < b.date ? 1 : -1).
      slice(start, start + this.visibleTxnsPerPage)
    );
  }

  @computed
  get visibleIsFirstPage() {
    return this.visibleTxnsOffset === 0;
  }

  @computed
  get visibleIsLastPage() {
    return this.visibleTxnsOffset + this.visibleTxnsPerPage >= this.txns.size;
  }

  @computed
  get loggedIn(): boolean {
    return Boolean(this.username);
  }

  @computed
  get accounts(): Map<string, Types.Account> {
    const all: string[][] =
      Object.values(this.txns).
      filter(Txns.touchesBank).
      map((txn) => {
        if (Txns.isBankTxn(txn)) {
          return [txn.account];
        } else if (Txns.isAccountTxfr(txn)) {
          return [txn.from, txn.to];
        }
        const n: never = txn;
        return n;
      });

    return new Map(
      R.uniq(R.flatten<string>(all)).
      map((name): [string, Types.Account] => [name, {name}])
    );
  }

  @computed
  get categories(): Map<string, Types.Category> {
    return (
      new Map(
        R.uniq(R.flatten<string>(
          Object.values(this.txns).
          filter(Txns.hasCategories).
          map((txn) => {
            if (Txns.isBankTxn(txn)) {
              return Object.keys(txn.categories);
            } else if (Txns.isEnvelopeTxfr(txn)) {
              return [txn.from, txn.to];
            }
            const n: never = txn;
            return n;
          })
        )).
        map((name): [string, Types.Category] => [name, {name}])
      )
    );
  }

  @computed
  get categoryBalances(): Map<string, Types.Balance> {
    const ledger = R.flatten<Txns.TxnItem>(
      Array.from(this.txns.values()).
        filter(Txns.hasCategories).
        map(Txns.categoriesForTxn)
    );
    const groups = R.groupBy(
      (txnItem) => txnItem.account,
      ledger
    );

    const totals =
      Object.entries(groups).
      map(([account, txnItems]): [string, Types.Balance] => 
        [
          account,
          {name: account, balance: txnItems.map(R.prop('amount')).reduce(R.add)}
        ]
      );
    return new Map(totals);
  }

  @computed
  get bankBalances(): Map<string, Types.Balance> {
    const groups = R.groupBy(
      (txnItem) => txnItem.account,
      Txns.journalToLedger(Array.from(this.txns.values()))
    );
    const totals =
      Object.entries(groups).
      map(([account, txnItems]): [string, Types.Balance] => 
        [
          account,
          {name: account, balance: txnItems.map(R.prop('amount')).reduce(R.add)}
        ]
      );
    return new Map(totals);
  }

  @action
  public setUsername(email: string | null) {
    this.email = email;
  }

  public setTxn(doc: Txns.Txn) {
    this.txns.set(doc._id, doc);
  }

  public removeTxn(doc: Txns.Txn) {
    this.txns.delete(doc._id);
  }

  @action
  public setDB(db: firebase.firestore.DocumentReference) {
    this.db = db;
  }

  public subscribeTxns() {
    const subscription = (this.dbC as any).liveFind({
      selector: {
        "$or": [
          {type: 'banktxn'},
          {type: 'accountTransfer'},
          {type: 'envelopeTransfer'},
        ]
      }
    });

    bacon.fromEvent(subscription, 'update').
      bufferWithTime(500).
      onValue(action((values: any[]) => {
        values.map(({action: couchAction, doc}) => {
          if (couchAction === 'ADD') return this.setTxn(doc);
          if (couchAction === 'UPDATE') return this.setTxn(doc);
          if (couchAction === 'REMOVE') return this.removeTxn(doc);
        })
      }));

    return new Promise((resolve, reject) => {
      // Consume accumulated and set up permanent listeners
      subscription.on('ready', (...args: any[]) => {
        resolve();
      });

      subscription.on('error', (err: any) => {
        console.error('Hit an error subscribing to txns', err);
        reject(err);
      });
    })
  }

  public async logIn(username: string, password: string) {
    console.log('Logging in');
    const remote = await Couch.mkRemoteDB(username);
    await Couch.logIn(remote, username, password);
    const session = await remote.getSession();
    console.log('Login successful');
    runInAction(() => {
      this.username = session.userCtx.name;
    });
    this.dbC = Couch.mkLocalDB();  // Covers recreating the DB after a logout destroys it
    this.remoteDB = remote;
    Couch.syncDBs(this.dbC, remote);
    console.log('blah')
  }

  public async logOut() {
    console.log('Logging out...');
    if (this.remoteDB) {
      await Couch.logOut(this.remoteDB);
      console.log('Logged out from CouchDB');
    }
    runInAction(() => {
      this.username = null;
    });
    this.txns.clear();  // Make sure the web page is emptied out in case we don't really redirect to /login

    await this.dbC.destroy();
  }

  @action
  public loadTxnsNextPage() {
    this.visibleTxnsOffset = Math.min(
      this.visibleTxnsOffset + this.visibleTxnsPerPage, 
      this.txns.size - this.visibleTxnsPerPage
    );
  }

  @action
  public loadTxnsPrevPage() {
    this.visibleTxnsOffset = Math.max(this.visibleTxnsOffset - this.visibleTxnsPerPage, 0);
  }

  @action
  public showHome() {
    const view: Views.Home = {name: 'home'};
    this.currentView = view;
  }

  @action
  public showLogin() {
    const view: Views.Login = {name: 'login'};
    console.log('here')
    this.currentView = view;
  }

  @computed
  public get urlPath() {
    const name = this.currentView.name;
    console.log('Showing page', name);
    switch (name) {
      case 'home': return '/'
      case 'login': return '/login'
      default:
        const n: never = name;
        return n;
    }
  }
}

const localDB = Couch.mkLocalDB();
const store = new Store(localDB);
store.init();
export default store;

(window as any).stuff = Couch.getSession();
