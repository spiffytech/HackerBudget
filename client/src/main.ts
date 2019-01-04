import axios from 'axios';
import Vue from 'vue';

import App from './App.vue';
import router from './router';
import store from './store';
import './registerServiceWorker';
import {endpoint} from '@/lib/config';

Vue.config.productionTip = false;

axios.defaults.withCredentials = true;

async function main() {
  try {
    const authResponse = await axios.get(`${endpoint}/isAuthed`);
    console.log('Authed');
    store.commit('setAuth', true);
    store.commit('setUserId', authResponse.data.userId);

    // Load data before initializing the app, otherwise our entire codebase is
    // littered with defensive coding against data not being loaded yet when
    // components load
    await store.dispatch('transactions/load');
    await store.dispatch('accounts/load');
  } catch (ex) {
    console.log('Probably not authorized');
    console.error(ex);
  }

  new Vue({
    router,
    store,
    render: (h) => h(App),
  }).$mount('#app');
}

main();