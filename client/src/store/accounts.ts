import Vue from 'vue';

import axios from 'axios';
import {Module} from 'vuex';
import * as CommonTypes from '../../../common/lib/types';
import {endpoint} from '@/lib/config';

interface ModuleState {
  balances: {[id: string]: CommonTypes.AccountBalance};
}

const module: Module<ModuleState, any> = {
  namespaced: true,
  getters: {
    accountBalances(state) {
      return (
        Object.values(state.balances).
        filter((balance) => balance.bucket.type === 'account').
        sort((a, b) => a.bucket.name < b.bucket.name ? -1 : 1)
      );
    },
    envelopeBalances(state) {
      return (
        Object.values(state.balances).
        filter((balance) => balance.bucket.type === 'envelope').
        sort((a, b) => a.bucket.name < b.bucket.name ? -1 : 1)
      );
    },
  },

  state: {
    balances: {},
  },

  mutations: {
    addBalances(state, balances: CommonTypes.AccountBalance[]) {
      balances.forEach((balance) =>
        Vue.set(state.balances, balance.bucket.id, balance),
      );
    },
  },

  actions: {
    async load(context) {
      console.log('here');
      const result = await axios.get(`${endpoint}/api/accounts/balances`);
      console.log('balances', result);
      context.commit('addBalances', result.data);
    },
  },
};

export default module;
