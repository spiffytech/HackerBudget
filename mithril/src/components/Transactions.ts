import gql from 'graphql-tag';
import isEqual from 'lodash/isEqual';
import m from 'mithril';
import {
  assign,
  interpret,
  Interpreter,
  Machine,
  MachineConfig,
  matchesState,
} from 'xstate';

import { LayoutChildProps } from './Layout';

import { fragments } from '../lib/graphql_fragements';
type Hasura = Pick<LayoutChildProps, 'hasura'>['hasura'];

interface TransactionsSchema {
  states: {
    configured: {
      states: {
        loading: {};
        error: {};
        ready: {};
      };
    };
  };
}

interface UrlParams {
  envelope: string | null;
  account: string | null;
  searchTerm: string | null;
  pageNum: number;
}

type TransactionsEvent =
  | { type: 'configure'; urlParams: UrlParams }
  | { type: 'error'; error: any }
  | { type: 'dataReceived'; transactions?: any[]};

interface TransactionsContext {
  error: any;
  hasura: Hasura;
  creds: Record<string, string>;
  urlParams: UrlParams;
  transactions: any[];
}

export default function Transactions(): m.Component<LayoutChildProps> {
  const machineDefinition: MachineConfig<
    TransactionsContext,
    TransactionsSchema,
    TransactionsEvent
  > = {
    id: 'transactions',
    initial: 'configured',
    states: {
      configured: {
        initial: 'loading',
        on: { configure: 'configured' },
        states: {
          loading: {
            entry: assign((context, event) => ({
              ...context,
              transactions: [],
              // Spread the old urlParams so we don't wipe out the initial
              // URLparams (since we default to this state and there's no event
              // with params to spread from)
              urlParams: {...context.urlParams, ...(event as any).urlParams},
            })),
            on: {
              error: 'error',
              dataReceived: {
                target: 'ready',
                actions: assign((context, event) => ({
                  ...context,
                  transactions: event.transactions,
                })),
              },
            },
          },
          error: {
            entry: assign((context, event) => ({
              ...context,
              error: (event as any).error,
            })),
          },
          ready: {
            on: {
              error: 'error',
              dataReceived: {
                target: 'ready',
                actions: assign((context, event) => ({
                  ...context,
                  transactions: event.transactions,
                })),
              },
            },
          },
        },
        invoke: {
          src: ({
            hasura,
            creds,
            urlParams: {pageNum},
          }: {
            hasura: Hasura;
            creds: any;
            urlParams: UrlParams;
          }) => fireEvent => {
            const limit = 50;
            const offset = pageNum * limit;
            try {
              const { unsubscribe } = hasura.subscribe(
                {
                  query: gql`
                    ${fragments}
                    subscription SubscribeTransactions(
                      $user_id: String!
                      $limit: Int!
                      $offset: Int!
                    ) {
                      txns_grouped(
                        where: {
                          user_id: { _eq: $user_id }
                        }
                        order_by: { date: desc, txn_id: asc }
                        limit: $limit
                        offset: $offset
                      ) {
                        ...txn_grouped
                      }
                    }
                  `,
                  variables: { user_id: creds.userId, limit, offset },
                },
                ({ data }) => {
                  const last = data.txns_grouped[data.txns_grouped.length - 1];
                  return fireEvent({ type: 'dataReceived', transactions: data.txns_grouped });
                },
                error => fireEvent({ type: 'error', error })
              );
              return () => {
                unsubscribe();
              }
            } catch (ex) {
              fireEvent({type: 'error', error: ex});
            }
          },
        },
      },
    },
  };

  let context: TransactionsContext | null = null;
  let service: Interpreter<
    TransactionsContext,
    TransactionsSchema,
    TransactionsEvent
  > | null = null;

  function getUrlParams(): UrlParams {
    return  {
      account: m.route.param('account'),
      envelope: m.route.param('envelope'),
      searchTerm: m.route.param('searchTerm'),
      pageNum: parseInt(m.route.param('pageNum') || '0'),
    };
  }

  let urlParams = getUrlParams();

  return {
    oninit({ attrs: { setTitle, hasura, creds } }) {
      setTitle('Transactions');

      const initialContext: TransactionsContext = {
        error: null,
        hasura,
        creds,
        urlParams,
        transactions: [],
      };

      const machine = Machine<
        TransactionsContext,
        TransactionsSchema,
        TransactionsEvent
      >(machineDefinition, {}, initialContext);
      service = interpret(machine);
      service.onChange(newContext => {
        context = newContext;
        m.redraw();
      });

      service.start();
    },

    onupdate() {
      const newUrlParams = getUrlParams();
      if (!isEqual(urlParams, newUrlParams)) {
        service!.send({type: 'configure', urlParams: newUrlParams});
      }
      urlParams = newUrlParams;
    },

    view() {
      if (matchesState('configured.error', service!.state.value)) {
        return m('', 'Error loading transactions:', context!.error.message);
      }

      if (!matchesState('configured.ready', service!.state.value)) {
        return m('', 'Loading...');
      }

      return [
        m(m.route.Link, {href: `/transactions?${m.buildQueryString({...context!.urlParams as any, pageNum: Math.max(0, context!.urlParams.pageNum - 1)})}`}, 'Previous'),
        m(m.route.Link, {href: `/transactions?${m.buildQueryString({...context!.urlParams as any, pageNum: context!.urlParams.pageNum + 1})}`}, 'Next'),
        context!.transactions.map(transaction =>
          m('', JSON.stringify(transaction))
        ),
      ];
    },

    onremove() {
      service?.stop();
    }
  };
}
