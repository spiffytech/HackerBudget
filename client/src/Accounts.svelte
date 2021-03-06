<script>
  import chain from 'ramda/es/chain';
  import fromPairs from 'ramda/es/fromPairs';
  import groupBy from 'ramda/es/groupBy';
  import uniq from 'ramda/es/uniq';
  import { getContext } from 'svelte';

  import * as Balances from './lib/Balances';
  import { toDollars } from './lib/pennies';
  import { formatDate } from './lib/utils';

  const accountsStore = getContext('accountsStore');
  const balancesStore = getContext('balancesStore');
  const transactionsStore = getContext('transactionsStore');
  const intervalStore = getContext('intervalStore');

  $: budgetPerEnvelope = new Map($accountsStore.filter(account => account.type === 'envelope').map(envelope => ({...envelope, balance: $balancesStore[envelope.id]})).map(envelope => [envelope.id, Balances.calcAmountForPeriod(envelope)[$intervalStore]]))

  $: totalBudget = Array.from(budgetPerEnvelope.values()).reduce((acc, item) => acc + item, 0);

  let estIncome = parseFloat(localStorage.getItem('estIncome') || 0);
  $: localStorage.setItem('estIncome', estIncome);

  // How often we use accounts
  $: usageTo = groupBy(txn => txn.to_id, $transactionsStore.filter(txn => txn.type === "banktxn"));

  $: sortFns = {
    name: (a, b) => (a.name < b.name ? -1 : 1),
    balance: (a, b) => {
      return $balancesStore[a.id] < $balancesStore[b.id] ? 1 : -1;
    },
    'frequently-used': (a, b) => {
      return (usageTo[a.id] || []).length > (usageTo[b.id] || []).length ? -1 : 1
    },
    budgeted: (a, b) => {
      return budgetPerEnvelope.get(a.id) < budgetPerEnvelope.get(b.id) ? 1 : -1;
    }
  };

  let showAccounts = false;
  let sortBy = 'frequently-used';
  $: sortFn = sortFns[sortBy];
  let sortTag = localStorage.getItem('selectedTag');
  $: localStorage.setItem('selectedTag', sortTag);

  $: accounts = $accountsStore.filter(account => account.type === 'account').sort(sortFn);
  $: envelopes = $accountsStore.filter(account => account.type === 'envelope').sort(sortFn);

  $: allTags = uniq(
    chain(envelope => Object.keys(envelope.tags), envelopes).sort()
  );

  $: envelopesByTag = groupBy(
    envelope => (sortTag ? envelope.tags[sortTag] : ''),
    envelopes
  );

  $: envelopeTagValues = Object.keys(envelopesByTag).sort();

  $: totalBalancesByTag = fromPairs(
    Object.entries(envelopesByTag).map(([tag, envelopeBalancesForTag]) => {
      return [
        tag,
        envelopeBalancesForTag
          .map(({ id }) => {
            if ($balancesStore[id]) {
              return $balancesStore[id];
            }
            return 0;
          })
          .reduce(
            (tagBalance, envelopeBalance) => tagBalance + envelopeBalance,
            0
          ),
      ];
    })
  );
</script>

<div class="m-3">
  <section aria-label="Display controls">
    <div class="shadow-md p-3 rounded-lg mb-3 bg-white max-w-sm">
      <header
        class="font-bold text-lg small-caps cursor-pointer"
        on:click={() => (showAccounts = !showAccounts)}
        data-cy="show-accounts">
        <span>›</span>
        Accounts
      </header>
    </div>

    {#if showAccounts}
      <table class="border-collapse">
        <tbody>
          {#each accounts as account}
            <a
              href={`/editAccount/${encodeURIComponent(encodeURIComponent(account.id))}`}
              style="display: contents; color: inherit; text-decoration: inherit;"
              data-cy="account"
              data-account-name={account.name}>
              <tr class="border-b border-black border-dashed">
                <td>{account.name}</td>
                <td class="text-right">
                  {toDollars($balancesStore[account.id])}
                </td>
              </tr>
            </a>
          {/each}
        </tbody>
      </table>
    {/if}

    <div class="shadow-md p-3 rounded-lg mb-3 bg-white max-w-sm">
      <header class="font-bold text-lg small-caps cursor-pointer">
        Envelopes
      </header>
      <label>
        Group by:
        <select bind:value={sortTag}>
          <option value={'null'}>No Tag</option>
          {#each allTags as tag}
            <option value={tag}>{tag}</option>
          {/each}
        </select>
      </label>

      <br />

      <label>
        Sort By:
        <select bind:value={sortBy}>
          <option value="name">Name</option>
          <option value="frequently-used">Frequently Used</option>
          <option value="balance">Balance</option>
          <option value="budgeted">Budgeted</option>
        </select>
      </label>
    </div>
  </section>

  <section role="main" aria-label="Envelope balances">
    <output>
      <span><span><label for="income">Income</label> (<input id="income" type="number" step="0.01" bind:value={estIncome} class="border w-16" />)</span> - Budget ({toDollars(totalBudget)})</span> = <span>{toDollars((estIncome * 100) - totalBudget)} / {$intervalStore}</span>
    </output>

    {#each envelopeTagValues as tagValue}
      <div data-cy={`envelope-group-${tagValue || 'null'}`}>
        <header class="small-caps">
          {sortTag === 'null' ? 'No tag selected' : sortTag}:
          <span class="font-bold small-caps">
            {tagValue === 'undefined' ? 'No Value' : tagValue}
          </span>
        </header>

        <table class="border-collapse">
          <thead>
            <tr>
              <td>Envelope</td>
              <td>Budgeted: <output>{toDollars(envelopesByTag[tagValue].map(envelope => budgetPerEnvelope.get(envelope.id)).reduce((acc, item) => acc + item, 0))} / {$intervalStore}</output></td>
              <td>Balance: <output data-cy="total-balance">{toDollars(totalBalancesByTag[tagValue])}</output></td>
            </tr>
          </thead>
          <tbody>
            {#each envelopesByTag[tagValue] as envelope}
              <a
                href={`/editAccount/${encodeURIComponent(encodeURIComponent(envelope.id))}`}
                style="display: contents; color: inherit; text-decoration:
                inherit;"
                data-cy="envelope"
                data-account-name={envelope.name}>
                <tr class="border-b border-black border-dashed">
                  <td class="w-full">{envelope.name}</td>
                  <td class="text-right"><output>{toDollars(budgetPerEnvelope.get(envelope.id))}</output></td>
                  <td class="text-right">
                    <output>{toDollars($balancesStore[envelope.id])}</output>
                  </td>
                </tr>
              </a>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
  </section>
</div>
