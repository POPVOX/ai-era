const data = window.SENATE_DISBURSEMENT_DATA || { metrics: {}, filters: {}, charts: {}, vendors: [], staffProfiles: [], transactions: [] };

const state = {
  search: "",
  type: "vendors",
  period: "",
  sort: "amount",
};

const els = {
  updated: document.querySelector("#senate-updated"),
  total: document.querySelector("#senate-total"),
  transactions: document.querySelector("#senate-transactions"),
  staff: document.querySelector("#senate-staff"),
  vendors: document.querySelector("#senate-vendors"),
  officeTotal: document.querySelector("#senate-office-total"),
  officeBars: document.querySelector("#senate-office-bars"),
  expenseBars: document.querySelector("#senate-expense-bars"),
  periodBars: document.querySelector("#senate-period-bars"),
  search: document.querySelector("#senate-search"),
  type: document.querySelector("#senate-record-type"),
  period: document.querySelector("#senate-period-filter"),
  sort: document.querySelector("#senate-sort"),
  heading: document.querySelector("#senate-result-heading"),
  visible: document.querySelector("#senate-visible-count"),
  results: document.querySelector("#senate-results"),
  empty: document.querySelector("#senate-empty"),
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

function formatDate(value) {
  if (!value) return "Local data";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function initials(name) {
  return String(name || "?")
    .replace(",", "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderStats() {
  els.updated.textContent = data.generatedAt ? `Updated ${formatDate(data.generatedAt)}` : "Local data";
  els.total.textContent = moneyFmt.format(data.metrics.total || 0);
  els.transactions.textContent = fmt.format(data.metrics.transactionRows || 0);
  els.staff.textContent = fmt.format(data.metrics.staffProfiles || 0);
  els.vendors.textContent = fmt.format(data.metrics.vendors || 0);
  els.officeTotal.textContent = moneyFmt.format(data.metrics.total || 0);
}

function barRows(rows, limit = 6) {
  const list = (rows || []).slice(0, limit);
  const max = Math.max(...list.map((row) => Math.abs(row.amount || 0)), 1);
  return list.map((row, index) => `
    <div class="expenditure-bar-row">
      <div class="expenditure-bar-label">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${moneyFmt.format(row.amount || 0)} · ${fmt.format(row.count || 0)} rows</span>
      </div>
      <div class="expenditure-bar-track"><i style="width:${Math.max(2, Math.abs(row.amount || 0) / max * 100)}%; background:${palette[index % palette.length]}"></i></div>
    </div>
  `).join("");
}

function renderCharts() {
  els.officeBars.innerHTML = barRows(data.charts.byOfficeType, 5);
  els.expenseBars.innerHTML = barRows(data.charts.byExpenseType, 6);
  els.periodBars.innerHTML = barRows(data.charts.byPeriod, 4);
}

function renderFilters() {
  for (const period of data.filters.periods || []) {
    const option = document.createElement("option");
    option.value = period;
    option.textContent = period;
    els.period.appendChild(option);
  }
}

function textFor(item) {
  return [
    item.label,
    item.name,
    item.payee,
    item.office,
    item.currentOffice,
    item.currentTitle,
    item.description,
    item.expenseType,
    item.reportPeriod,
    item.overlapCaveat,
  ].join(" ").toLowerCase();
}

function rowsForType() {
  if (state.type === "staff") return data.staffProfiles || [];
  if (state.type === "transactions") return data.transactions || [];
  return data.vendors || [];
}

function matches(item) {
  const query = state.search.trim().toLowerCase();
  const periodMatch = !state.period || item.reportPeriod === state.period || (item.periods || []).includes(state.period);
  return periodMatch && (!query || textFor(item).includes(query));
}

function filteredRows() {
  const rows = rowsForType().filter(matches);
  rows.sort((a, b) => {
    if (state.sort === "name") return String(a.label || a.name || a.payee || "").localeCompare(String(b.label || b.name || b.payee || ""));
    if (state.sort === "rows") return (b.count || b.rowCount || 0) - (a.count || a.rowCount || 0);
    return Math.abs(b.amount || 0) - Math.abs(a.amount || 0);
  });
  return rows;
}

function caveatBadge(item) {
  const hasCaveat = item.overlapCaveat || item.hasOverlapCaveat;
  return hasCaveat ? `<span class="inactive-status">Report period overlaps 2024/2025</span>` : "";
}

function renderVendor(item) {
  return `
    <article class="staff-card">
      <div class="witness-avatar" aria-hidden="true">${escapeHtml(initials(item.label))}</div>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3>${escapeHtml(item.label)}</h3>
            <p>${moneyFmt.format(item.amount || 0)} across ${fmt.format(item.count || 0)} parsed rows</p>
          </div>
          <div class="witness-badges"><span>Vendor</span></div>
        </div>
      </div>
    </article>
  `;
}

function renderStaff(item) {
  return `
    <article class="staff-card">
      <div class="witness-avatar" aria-hidden="true">${escapeHtml(initials(item.name))}</div>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.currentTitle || "Title not listed")}</p>
          </div>
          <div class="witness-badges">
            <span>Senate staff</span>
            ${caveatBadge(item)}
          </div>
        </div>
        <p class="witness-org">${escapeHtml(item.currentOffice || "Office not listed")}</p>
        <div class="staff-meta-row">
          <span>${fmt.format(item.rowCount || 0)} row${item.rowCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(item.officeCount || 0)} office${item.officeCount === 1 ? "" : "s"}</span>
          <span>${escapeHtml(item.latestPeriod || "Period not listed")}</span>
        </div>
      </div>
    </article>
  `;
}

function renderTransaction(item) {
  return `
    <article class="staff-card">
      <div class="witness-avatar" aria-hidden="true">$</div>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3>${escapeHtml(item.payee)}</h3>
            <p>${escapeHtml(item.description || "Description not listed")}</p>
          </div>
          <div class="witness-badges">
            <span>${moneyFmt.format(item.amount || 0)}</span>
            ${caveatBadge(item)}
          </div>
        </div>
        <p class="witness-org">${escapeHtml(item.office || "Office not listed")}</p>
        <div class="staff-meta-row">
          <span>${escapeHtml(item.postedDate || "No posted date")}</span>
          <span>${escapeHtml(item.reportPeriod || "No report period")}</span>
          <span>PDF page ${fmt.format(item.page || 0)}</span>
          <span>${escapeHtml(item.reportPage || "Report page n/a")}</span>
        </div>
        <div class="witness-link-row"><a href="${escapeHtml(item.sourcePdfUrl)}#page=${encodeURIComponent(item.page || 1)}" target="_blank" rel="noopener">Open source page</a></div>
      </div>
    </article>
  `;
}

function render() {
  const rows = filteredRows();
  const labels = { vendors: "vendors", staff: "staff profiles", transactions: "transactions" };
  els.heading.textContent = `${fmt.format(rows.length)} Senate ${labels[state.type]}`;
  const sampleNote = state.type === "transactions" ? ` of top ${fmt.format(data.metrics.transactionSampleLimit || rowsForType().length)}` : "";
  els.visible.textContent = `${fmt.format(Math.min(rows.length, 120))} shown${sampleNote}`;
  els.empty.hidden = rows.length > 0;
  const renderer = state.type === "staff" ? renderStaff : state.type === "transactions" ? renderTransaction : renderVendor;
  els.results.innerHTML = rows.slice(0, 120).map(renderer).join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  els.type.addEventListener("change", (event) => {
    state.type = event.target.value;
    render();
  });
  els.period.addEventListener("change", (event) => {
    state.period = event.target.value;
    render();
  });
  els.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
}

renderStats();
renderCharts();
renderFilters();
bindEvents();
render();
