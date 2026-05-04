const data = window.SENATE_DISBURSEMENT_DATA || { metrics: {}, filters: {}, charts: {}, vendors: [], transactions: [] };

const state = {
  vendors: [],
  filtered: [],
  view: "cards",
  selected: null,
};

const els = {
  updated: document.querySelector("#senate-updated"),
  total: document.querySelector("#senate-total"),
  transactions: document.querySelector("#senate-transactions"),
  periods: document.querySelector("#senate-periods"),
  vendors: document.querySelector("#senate-vendors"),
  officeTotal: document.querySelector("#senate-office-total"),
  officeBars: document.querySelector("#senate-office-bars"),
  expenseBars: document.querySelector("#senate-expense-bars"),
  periodBars: document.querySelector("#senate-period-bars"),
  search: document.querySelector("#senate-search"),
  office: document.querySelector("#senate-office-filter"),
  expense: document.querySelector("#senate-expense-filter"),
  period: document.querySelector("#senate-period-filter"),
  sort: document.querySelector("#senate-sort"),
  heading: document.querySelector("#senate-result-heading"),
  visible: document.querySelector("#senate-visible-count"),
  grid: document.querySelector("#senate-grid"),
  tableWrap: document.querySelector("#senate-table-wrap"),
  tableBody: document.querySelector("#senate-table-body"),
  empty: document.querySelector("#senate-empty"),
  profile: document.querySelector("#senate-profile"),
  topTransactions: document.querySelector("#senate-top-transaction-body"),
};

const fmt = new Intl.NumberFormat("en-US");
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const palette = ["#0d2a47", "#f45a3f", "#2f7b68", "#bd7a2d", "#65739b", "#9d3f2f"];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function money(value) {
  return moneyFmt.format(value || 0);
}

function formatDate(value) {
  if (!value) return "Local data";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function share(amount, total) {
  if (!total) return "0%";
  return `${Math.abs(amount / total * 100).toFixed(1)}%`;
}

function initials(name) {
  return String(name || "?")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function labelValue(row) {
  return typeof row === "string" ? row : row?.label || "";
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${(values || [])
    .map(labelValue)
    .filter(Boolean)
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
}

function addAmount(map, label, amount, extra = {}) {
  if (!label) return;
  const current = map.get(label) || { label, amount: 0, count: 0, ...extra };
  current.amount += Number(amount || 0);
  current.count += 1;
  map.set(label, current);
}

function topRows(map, limit = 5) {
  return [...map.values()]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function buildVendorDetails() {
  const details = new Map();
  for (const vendor of data.vendors || []) {
    details.set(vendor.label, {
      ...vendor,
      vendor: vendor.label,
      officeTypes: new Map(),
      expenseTypes: new Map(),
      periods: new Map(),
      offices: new Map(),
      descriptions: new Map(),
      transactions: [],
    });
  }

  for (const row of data.transactions || []) {
    const name = row.payee || row.label || "Vendor not listed";
    if (!details.has(name)) {
      details.set(name, {
        label: name,
        vendor: name,
        amount: 0,
        count: 0,
        officeTypes: new Map(),
        expenseTypes: new Map(),
        periods: new Map(),
        offices: new Map(),
        descriptions: new Map(),
        transactions: [],
      });
    }
    const vendor = details.get(name);
    addAmount(vendor.officeTypes, row.officeType || "Office type pending", row.amount);
    addAmount(vendor.expenseTypes, row.expenseType || "Expense type pending", row.amount);
    addAmount(vendor.periods, row.reportPeriod || "Report period pending", row.amount);
    addAmount(vendor.offices, row.office || "Office not listed", row.amount);
    addAmount(vendor.descriptions, row.description || "Description not listed", row.amount);
    vendor.transactions.push(row);
  }

  return [...details.values()].map((vendor) => {
    const topOfficeTypes = topRows(vendor.officeTypes, 6);
    const topExpenseTypes = topRows(vendor.expenseTypes, 6);
    const topPeriods = topRows(vendor.periods, 4);
    const topOffices = topRows(vendor.offices, 8);
    const topDescriptions = topRows(vendor.descriptions, 8);

    return {
      ...vendor,
      topOfficeTypes,
      topExpenseTypes,
      topPeriods,
      topOffices,
      topDescriptions,
      officeTypeList: topOfficeTypes.map((row) => row.label),
      expenseTypeList: topExpenseTypes.map((row) => row.label),
      periodList: topPeriods.map((row) => row.label),
      officeCount: vendor.offices.size,
      transactionSample: vendor.transactions.sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0)).slice(0, 10),
    };
  });
}

function renderStats() {
  els.updated.textContent = data.generatedAt ? `Updated ${formatDate(data.generatedAt)}` : "Local data";
  els.total.textContent = money(data.metrics.total || 0);
  els.transactions.textContent = fmt.format(data.metrics.transactionRows || 0);
  els.periods.textContent = fmt.format((data.filters.periods || []).length);
  els.vendors.textContent = fmt.format(data.metrics.vendors || 0);
  els.officeTotal.textContent = money(data.metrics.total || 0);
}

function renderBars(container, rows, total, limit = 6) {
  const list = (rows || []).slice(0, limit);
  const max = Math.max(...list.map((row) => Math.abs(row.amount || 0)), 1);
  container.innerHTML = list.map((row, index) => `
    <div class="expenditure-bar-row">
      <div class="expenditure-bar-label">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${money(row.amount || 0)} · ${share(row.amount || 0, total)} · ${fmt.format(row.count || 0)} rows</span>
      </div>
      <div class="expenditure-bar-track"><i style="width:${Math.max(2, Math.abs(row.amount || 0) / max * 100)}%; background:${palette[index % palette.length]}"></i></div>
    </div>
  `).join("");
}

function renderCharts() {
  renderBars(els.officeBars, data.charts.byOfficeType, data.metrics.total, 5);
  renderBars(els.expenseBars, data.charts.byExpenseType, data.metrics.total, 6);
  renderBars(els.periodBars, data.charts.byPeriod, data.metrics.total, 4);
}

function applyInitialUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const search = params.get("search") || params.get("q") || "";
  const office = params.get("office") || "";
  const expense = params.get("expense") || "";
  const period = params.get("period") || "";

  if (search) els.search.value = search;
  if (office && [...els.office.options].some((option) => option.value === office)) els.office.value = office;
  if (expense && [...els.expense.options].some((option) => option.value === expense)) els.expense.value = expense;
  if (period && [...els.period.options].some((option) => option.value === period)) els.period.value = period;
}

function hydrate() {
  state.vendors = buildVendorDetails();
  fillSelect(els.office, data.filters.officeTypes || [], "All office types");
  fillSelect(els.expense, data.filters.expenseTypes || [], "All expense types");
  fillSelect(els.period, data.filters.periods || [], "All periods");
  applyInitialUrlFilters();
  renderStats();
  renderCharts();
  renderTopTransactions();
  state.selected = state.vendors[0] || null;
  applyFilters();
}

function matches(vendor) {
  const query = els.search.value.trim().toLowerCase();
  const office = els.office.value;
  const expense = els.expense.value;
  const period = els.period.value;
  if (office && !vendor.officeTypeList.includes(office)) return false;
  if (expense && !vendor.expenseTypeList.includes(expense)) return false;
  if (period && !vendor.periodList.includes(period)) return false;
  if (!query) return true;
  const haystack = [
    vendor.label,
    ...vendor.officeTypeList,
    ...vendor.expenseTypeList,
    ...vendor.periodList,
    ...vendor.topOffices.map((row) => row.label),
    ...vendor.topDescriptions.map((row) => row.label),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function applyFilters() {
  const sort = els.sort.value;
  state.filtered = state.vendors.filter(matches);
  state.filtered.sort((a, b) => {
    if (sort === "name") return a.label.localeCompare(b.label);
    if (sort === "offices") return b.officeCount - a.officeCount || Math.abs(b.amount) - Math.abs(a.amount);
    if (sort === "transactions") return b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount);
    return Math.abs(b.amount) - Math.abs(a.amount);
  });
  if (!state.selected || !state.filtered.some((vendor) => vendor.label === state.selected.label)) {
    state.selected = state.filtered[0] || null;
  }
  render();
}

function topExpense(vendor) {
  return vendor.topExpenseTypes[0]?.label || "Expense type pending";
}

function vendorCard(vendor) {
  const selected = state.selected?.label === vendor.label;
  return `
    <article class="vendor-card${selected ? " selected" : ""}" data-vendor="${escapeHtml(vendor.label)}">
      <div class="vendor-card-top">
        <span class="vendor-symbol">${escapeHtml(initials(vendor.label))}</span>
        <div>
          <h3>${escapeHtml(vendor.label)}</h3>
          <p>${escapeHtml(topExpense(vendor))}</p>
        </div>
      </div>
      <div class="vendor-card-metrics">
        <span><strong>${money(vendor.amount)}</strong> spend</span>
        <span><strong>${fmt.format(vendor.count)}</strong> rows</span>
        <span><strong>${fmt.format(vendor.officeCount)}</strong> offices</span>
      </div>
      <div class="vendor-chip-row">
        ${vendor.officeTypeList.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>
  `;
}

function vendorRow(vendor) {
  return `
    <tr data-vendor="${escapeHtml(vendor.label)}">
      <td><button type="button" class="table-link" data-vendor="${escapeHtml(vendor.label)}">${escapeHtml(vendor.label)}</button></td>
      <td>${money(vendor.amount)}</td>
      <td>${fmt.format(vendor.count)}</td>
      <td>${fmt.format(vendor.officeCount)}</td>
      <td>${escapeHtml(topExpense(vendor))}</td>
    </tr>
  `;
}

function render() {
  els.heading.textContent = `${fmt.format(state.filtered.length)} vendors`;
  els.visible.textContent = `${fmt.format(state.filtered.length)} visible`;
  els.empty.hidden = state.filtered.length > 0;
  els.grid.hidden = state.view !== "cards";
  els.tableWrap.hidden = state.view !== "table";
  els.grid.innerHTML = state.filtered.slice(0, 240).map(vendorCard).join("");
  els.tableBody.innerHTML = state.filtered.slice(0, 500).map(vendorRow).join("");
  renderProfile(state.selected);
}

function miniBars(rows) {
  if (!rows?.length) return '<div class="empty-state">No detail available.</div>';
  const max = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);
  return `<div class="vendor-mini-bars">${rows.map((row) => `
    <div>
      <span><strong>${escapeHtml(row.label)}</strong><em>${money(row.amount)}</em></span>
      <i><b style="width:${Math.max(3, Math.abs(row.amount) / max * 100)}%"></b></i>
    </div>
  `).join("")}</div>`;
}

function renderProfile(vendor) {
  if (!vendor) {
    els.profile.innerHTML = '<p class="eyebrow">Vendor profile</p><h2>Select a vendor</h2><p>No vendor is selected.</p>';
    return;
  }
  els.profile.innerHTML = `
    <p class="eyebrow">Vendor profile</p>
    <h2>${escapeHtml(vendor.label)}</h2>
    <div class="vendor-profile-metrics">
      <article><strong>${money(vendor.amount)}</strong><span>Total spend</span></article>
      <article><strong>${fmt.format(vendor.count)}</strong><span>Rows</span></article>
      <article><strong>${fmt.format(vendor.officeCount)}</strong><span>Senate offices</span></article>
    </div>
    <div class="vendor-profile-section">
      <h3>Senate offices</h3>
      ${miniBars(vendor.topOffices)}
    </div>
    <div class="vendor-profile-section">
      <h3>Repeated descriptions</h3>
      ${miniBars(vendor.topDescriptions)}
    </div>
    <div class="vendor-profile-section">
      <h3>Exposure</h3>
      <div class="vendor-chip-row">
        ${[...vendor.officeTypeList, ...vendor.expenseTypeList.slice(0, 4)].map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderTopTransactions() {
  els.topTransactions.innerHTML = (data.transactions || []).slice(0, 25).map((row) => `
    <tr>
      <td>${escapeHtml(row.payee)}</td>
      <td>${money(row.amount)}</td>
      <td>${escapeHtml(row.office)}<div>${escapeHtml(row.officeType)}</div></td>
      <td>${escapeHtml(row.description)}<div>${escapeHtml(row.expenseType)}</div></td>
      <td>${escapeHtml(row.reportPeriod)}<div><a href="${escapeHtml(row.sourcePdfUrl)}#page=${encodeURIComponent(row.page || 1)}" target="_blank" rel="noopener">PDF page ${fmt.format(row.page || 1)}</a></div></td>
    </tr>
  `).join("");
}

function selectVendor(name) {
  const vendor = state.vendors.find((item) => item.label === name);
  if (!vendor) return;
  state.selected = vendor;
  render();
}

[els.search, els.office, els.expense, els.period, els.sort].forEach((input) => {
  input.addEventListener("input", applyFilters);
  input.addEventListener("change", applyFilters);
});

document.querySelectorAll("[data-senate-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.senateView;
    document.querySelectorAll("[data-senate-view]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

els.grid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-vendor]");
  if (card) selectVendor(card.dataset.vendor);
});

els.tableBody.addEventListener("click", (event) => {
  const target = event.target.closest("[data-vendor]");
  if (target) selectVendor(target.dataset.vendor);
});

hydrate();
