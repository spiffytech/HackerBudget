//import { faPlus, faDollarSign, faChartLine, faArrowRight, faUserAlt } from '@fortawesome/free-solid-svg-icons';
import m from 'mithril';

import Layout from './components/Layout';
import Transactions from './components/Transactions';

m.route(document.body, '/transactions', {
  '/transactions': {
    render() {
      return m(Layout, { body: Transactions });
    },
  },
});
