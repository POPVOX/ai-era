const directory = window.HOUSE_EXPENDITURE_DATA;

const state = {
  vendors: directory.vendors || [],
  filtered: [],
  view: 'cards',
  selected: null,
};

const els = {
  updated: document.querySelector('#expenditure-updated'),
  total: document.querySelector('#expenditure-total'),
  transactions: document.querySelector('#expenditure-transactions'),
  vendors: document.querySelector('#expenditure-vendors'),
  offices: document.querySelector('#expenditure-offices'),
  officeTotal: document.querySelector('#office-type-chart-total'),
  officeBars: document.querySelector('#office-type-bars'),
  donut: document.querySelector('#expense-donut'),
  legend: document.querySelector('#expense-legend'),
  periodChart: document.querySelector('#period-chart'),
  search: document.querySelector('#vendor-search'),
  office: document.querySelector('#vendor-office-filter'),
  expense: document.querySelector('#vendor-expense-filter'),
  period: document.querySelector('#vendor-period-filter'),
  sort: document.querySelector('#vendor-sort'),
  heading: document.querySelector('#vendor-result-heading'),
  visible: document.querySelector('#vendor-visible-count'),
  grid: document.querySelector('#vendor-grid'),
  tableWrap: document.querySelector('#vendor-table-wrap'),
  tableBody: document.querySelector('#vendor-table-body'),
  empty: document.querySelector('#vendor-empty'),
  profile: document.querySelector('#vendor-profile'),
  topTransactions: document.querySelector('#top-transaction-body'),
};

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-US');
const palette = ['#0b2a4a', '#f35a42', '#2f6f5e', '#b2752d', '#5f6fa8', '#8b3f2d', '#4c7a93'];

function money(value) {
  return moneyFmt.format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function share(amount, total) {
  if (!total) return '0%';
  return `${Math.abs(amount / total * 100).toFixed(1)}%`;
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
}

function renderMetricShell() {
  els.updated.textContent = new Date(directory.generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  els.total.textContent = money(directory.metrics.total);
  els.transactions.textContent = numberFmt.format(directory.metrics.transactionCount);
  els.vendors.textContent = numberFmt.format(directory.metrics.vendorCount);
  els.offices.textContent = numberFmt.format(directory.metrics.organizationCount);
  els.officeTotal.textContent = money(directory.metrics.total);
}

function renderBars(container, rows, total) {
  const max = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);
  container.innerHTML = rows.map((row, index) => `
    <div class="expenditure-bar-row">
      <div class="expenditure-bar-label">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${money(row.amount)} · ${share(row.amount, total)} · ${numberFmt.format(row.count)} rows</span>
      </div>
      <div class="expenditure-bar-track"><i style="width:${Math.max(2, Math.abs(row.amount) / max * 100)}%; background:${palette[index % palette.length]}"></i></div>
    </div>
  `).join('');
}

function renderDonut(rows, total) {
  const top = rows.slice(0, 6);
  let cursor = 0;
  const stops = top.map((row, index) => {
    const pct = Math.abs(row.amount) / total * 100;
    const stop = `${palette[index % palette.length]} ${cursor}% ${cursor + pct}%`;
    cursor += pct;
    return stop;
  });
  if (cursor < 100) stops.push(`#e9e2d8 ${cursor}% 100%`);
  els.donut.style.background = `conic-gradient(${stops.join(', ')})`;
  els.legend.innerHTML = top.map((row, index) => `
    <div><i style="background:${palette[index % palette.length]}"></i><span>${escapeHtml(row.label)}</span><strong>${share(row.amount, total)}</strong></div>
  `).join('');
}

function renderPeriodChart(rows) {
  const max = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);
  els.periodChart.innerHTML = rows.map((row, index) => `
    <div class="period-column">
      <div class="period-column-bar"><i style="height:${Math.max(5, Math.abs(row.amount) / max * 100)}%; background:${palette[index % palette.length]}"></i></div>
      <strong>${escapeHtml(row.label.replace(' 2025', ''))}</strong>
      <span>${money(row.amount)}</span>
    </div>
  `).join('');
}

function hydrate() {
  fillSelect(els.office, directory.options.officeTypes || [], 'All office types');
  fillSelect(els.expense, directory.options.expenseKinds || [], 'All expense types');
  fillSelect(els.period, directory.options.periods || [], 'All periods');
  renderMetricShell();
  renderBars(els.officeBars, directory.charts.byOfficeType, directory.metrics.total);
  renderDonut(directory.charts.byExpenseKind, directory.metrics.total);
  renderPeriodChart(directory.charts.byPeriod);
  renderTopTransactions();
  state.selected = state.vendors[1] || state.vendors[0] || null;
  applyFilters();
}

function matches(vendor) {
  const query = els.search.value.trim().toLowerCase();
  const office = els.office.value;
  const expense = els.expense.value;
  const period = els.period.value;
  if (office && !vendor.officeTypes.includes(office)) return false;
  if (expense && !vendor.expenseKinds.includes(expense)) return false;
  if (period && !vendor.periods.includes(period)) return false;
  if (!query) return true;
  const haystack = [
    vendor.vendor,
    vendor.vendorType,
    ...vendor.officeTypes,
    ...vendor.expenseKinds,
    ...vendor.periods,
    ...vendor.topClients.map((item) => item.label),
    ...vendor.topDescriptions.map((item) => item.label),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function applyFilters() {
  const sort = els.sort.value;
  state.filtered = state.vendors.filter(matches);
  state.filtered.sort((a, b) => {
    if (sort === 'name') return a.vendor.localeCompare(b.vendor);
    if (sort === 'clients') return b.clientCount - a.clientCount || Math.abs(b.amount) - Math.abs(a.amount);
    if (sort === 'transactions') return b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount);
    return Math.abs(b.amount) - Math.abs(a.amount);
  });
  if (!state.selected || !state.filtered.some((vendor) => vendor.vendor === state.selected.vendor)) {
    state.selected = state.filtered.find((vendor) => vendor.vendor !== 'No vendor listed') || state.filtered[0] || null;
  }
  render();
}

function topExpense(vendor) {
  return vendor.expenseKinds[0] || 'Expense type pending';
}

function vendorCard(vendor) {
  const selected = state.selected?.vendor === vendor.vendor;
  return `
    <article class="vendor-card${selected ? ' selected' : ''}" data-vendor="${escapeHtml(vendor.vendor)}">
      <div class="vendor-card-top">
        <span class="vendor-symbol">${escapeHtml(vendor.vendor.slice(0, 2).toUpperCase())}</span>
        <div>
          <h3>${escapeHtml(vendor.vendor)}</h3>
          <p>${escapeHtml(topExpense(vendor))}</p>
        </div>
      </div>
      ${vendor.vendorType && vendor.vendorType !== 'Named vendor' ? `<div class="vendor-context-badge">${escapeHtml(vendor.vendorType)}</div>` : ''}
      <div class="vendor-card-metrics">
        <span><strong>${money(vendor.amount)}</strong> spend</span>
        <span><strong>${numberFmt.format(vendor.count)}</strong> rows</span>
        <span><strong>${numberFmt.format(vendor.clientCount)}</strong> clients</span>
      </div>
      <div class="vendor-chip-row">
        ${vendor.officeTypes.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
      </div>
      <a class="vendor-detail-link" href="vendor.html?v=${encodeURIComponent(vendor.slug)}">Open transaction detail</a>
    </article>
  `;
}

function vendorRow(vendor) {
  return `
    <tr data-vendor="${escapeHtml(vendor.vendor)}">
      <td><button type="button" class="table-link" data-vendor="${escapeHtml(vendor.vendor)}">${escapeHtml(vendor.vendor)}</button></td>
      <td>${money(vendor.amount)}</td>
      <td>${numberFmt.format(vendor.count)}</td>
      <td>${numberFmt.format(vendor.clientCount)}</td>
      <td>${escapeHtml(vendor.vendorType && vendor.vendorType !== 'Named vendor' ? vendor.vendorType : topExpense(vendor))}</td>
    </tr>
  `;
}

function render() {
  els.heading.textContent = `${numberFmt.format(state.filtered.length)} vendors`;
  els.visible.textContent = `${numberFmt.format(state.filtered.length)} visible`;
  els.empty.hidden = state.filtered.length > 0;
  els.grid.hidden = state.view !== 'cards';
  els.tableWrap.hidden = state.view !== 'table';
  els.grid.innerHTML = state.filtered.slice(0, 240).map(vendorCard).join('');
  els.tableBody.innerHTML = state.filtered.slice(0, 500).map(vendorRow).join('');
  renderProfile(state.selected);
}

function miniBars(rows, total) {
  if (!rows?.length) return '<div class="empty-state">No detail available.</div>';
  const max = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);
  return `<div class="vendor-mini-bars">${rows.map((row) => `
    <div>
      <span><strong>${escapeHtml(row.label)}</strong><em>${money(row.amount)}</em></span>
      <i><b style="width:${Math.max(3, Math.abs(row.amount) / max * 100)}%"></b></i>
    </div>
  `).join('')}</div>`;
}

function renderProfile(vendor) {
  if (!vendor) {
    els.profile.innerHTML = '<p class="eyebrow">Vendor profile</p><h2>Select a vendor</h2><p>No vendor is selected.</p>';
    return;
  }
  els.profile.innerHTML = `
    <p class="eyebrow">Vendor profile</p>
    <h2>${escapeHtml(vendor.vendor)}</h2>
    ${vendor.vendorType && vendor.vendorType !== 'Named vendor' ? `<div class="vendor-context-note"><strong>${escapeHtml(vendor.vendorType)}</strong><span>${escapeHtml(vendor.vendorNote)}</span></div>` : ''}
    <div class="vendor-profile-metrics">
      <article><strong>${money(vendor.amount)}</strong><span>Total spend</span></article>
      <article><strong>${numberFmt.format(vendor.count)}</strong><span>Transactions</span></article>
      <article><strong>${numberFmt.format(vendor.clientCount)}</strong><span>House clients</span></article>
    </div>
    <div class="vendor-profile-section">
      <h3>House clients</h3>
      ${miniBars(vendor.topClients, vendor.amount)}
    </div>
    <div class="vendor-profile-section">
      <h3>Repeated descriptions</h3>
      ${miniBars(vendor.topDescriptions, vendor.amount)}
    </div>
    <div class="vendor-profile-section">
      <h3>Exposure</h3>
      <div class="vendor-chip-row">
        ${[...vendor.officeTypes, ...vendor.expenseKinds.slice(0, 4)].map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
      </div>
    </div>
    <a class="button vendor-profile-button" href="vendor.html?v=${encodeURIComponent(vendor.slug)}">Open full transaction view</a>
  `;
}

function renderTopTransactions() {
  els.topTransactions.innerHTML = directory.charts.topTransactions.slice(0, 25).map((row) => `
    <tr>
      <td>${escapeHtml(row.vendor)}</td>
      <td>${money(row.amount)}</td>
      <td>${escapeHtml(row.organization)}<div>${escapeHtml(row.officeType)}</div></td>
      <td>${escapeHtml(row.description)}<div>${escapeHtml(row.vendorType && row.vendorType !== 'Named vendor' ? `${row.vendorType} · ${row.expenseKind}` : row.expenseKind)}</div></td>
      <td>${escapeHtml(row.period)}</td>
    </tr>
  `).join('');
}

function selectVendor(name) {
  const vendor = state.vendors.find((item) => item.vendor === name);
  if (!vendor) return;
  state.selected = vendor;
  render();
}

[els.search, els.office, els.expense, els.period, els.sort].forEach((input) => {
  input.addEventListener('input', applyFilters);
  input.addEventListener('change', applyFilters);
});

document.querySelectorAll('[data-vendor-view]').forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.vendorView;
    document.querySelectorAll('[data-vendor-view]').forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

els.grid.addEventListener('click', (event) => {
  if (event.target.closest('a')) return;
  const card = event.target.closest('[data-vendor]');
  if (card) selectVendor(card.dataset.vendor);
});

els.tableBody.addEventListener('click', (event) => {
  const target = event.target.closest('[data-vendor]');
  if (target) selectVendor(target.dataset.vendor);
});

hydrate();
