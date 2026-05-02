const directory = window.HOUSE_STAFF_DATA || { totals: {}, filters: {}, profiles: [] };

const state = {
  search: "",
  staffType: "",
  period: "",
  sort: "name",
  showInactive: false,
};

const els = {
  updated: document.querySelector("#staff-updated"),
  count: document.querySelector("#staff-count"),
  offices: document.querySelector("#staff-office-count"),
  titles: document.querySelector("#staff-title-count"),
  rows: document.querySelector("#staff-row-count"),
  search: document.querySelector("#staff-search"),
  showInactive: document.querySelector("#staff-show-inactive"),
  type: document.querySelector("#staff-type-filter"),
  period: document.querySelector("#staff-period-filter"),
  sort: document.querySelector("#staff-sort"),
  officeList: document.querySelector("#staff-office-list"),
  visible: document.querySelector("#staff-visible-count"),
  heading: document.querySelector("#staff-result-heading"),
  grid: document.querySelector("#staff-grid"),
  empty: document.querySelector("#staff-empty"),
};

const fmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const periodOrder = new Map((directory.filters.periods || []).map((period, index) => [period, index]));

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
  if (!value) return "Local prototype";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function profileText(profile) {
  return [
    profile.name,
    profile.currentOffice,
    profile.currentTitle,
    profile.staffType,
    profile.latestPeriod,
    ...(profile.periods || []),
    ...(profile.topOffices || []).map((item) => item.label),
    ...(profile.topTitles || []).map((item) => item.label),
  ].join(" ").toLowerCase();
}

function profileHref(profile) {
  return `staffers/${encodeURIComponent(profile.slug)}.html`;
}

function matches(profile) {
  const query = state.search.trim().toLowerCase();
  if (!state.showInactive && !profile.isActive) return false;
  if (state.staffType && profile.staffType !== state.staffType) return false;
  if (state.period && !(profile.periods || []).includes(state.period)) return false;
  if (!query) return true;
  return profileText(profile).includes(query);
}

function filteredProfiles() {
  const rows = directory.profiles.filter(matches);
  rows.sort((a, b) => {
    if (state.sort === "recent") return (periodOrder.get(b.latestPeriod) ?? -1) - (periodOrder.get(a.latestPeriod) ?? -1) || a.name.localeCompare(b.name);
    if (state.sort === "roles") return b.roleCount - a.roleCount || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderStats() {
  els.count.textContent = fmt.format(directory.totals.activeStaffers || 0);
  els.offices.textContent = fmt.format(directory.totals.offices || 0);
  els.titles.textContent = fmt.format(directory.totals.titles || 0);
  els.rows.textContent = fmt.format(directory.totals.payrollRows || 0);
  els.updated.textContent = directory.generatedAt ? `Updated ${formatDate(directory.generatedAt)}` : "Local prototype";
}

function renderFilters() {
  for (const item of directory.filters.staffTypes || []) {
    const option = document.createElement("option");
    option.value = item.label;
    option.textContent = `${item.label} (${fmt.format(item.count)})`;
    els.type.appendChild(option);
  }

  for (const period of directory.filters.periods || []) {
    const option = document.createElement("option");
    option.value = period;
    option.textContent = period;
    els.period.appendChild(option);
  }

  els.officeList.innerHTML = `
    <p class="eyebrow">Top offices</p>
    ${(directory.filters.offices || []).slice(0, 10).map((office) => `
      <button type="button" data-office="${escapeHtml(office.label)}">
        <span>${escapeHtml(office.label.replace(/^HON\\. /, ""))}</span>
        <strong>${fmt.format(office.count)}</strong>
      </button>
    `).join("")}
  `;

  els.officeList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.search = button.dataset.office || "";
      els.search.value = state.search;
      render();
    });
  });
}

function renderProfile(profile) {
  const status = profile.isActive ? "Active" : "Inactive";
  return `
    <article class="staff-card ${profile.isActive ? "" : "inactive"}">
      <a class="witness-avatar" href="${escapeHtml(profileHref(profile))}" aria-label="${escapeHtml(profile.name)} profile">${escapeHtml(initials(profile.name))}</a>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3><a href="${escapeHtml(profileHref(profile))}">${escapeHtml(profile.name)}</a></h3>
            <p>${escapeHtml(profile.currentTitle || "Title not listed")}</p>
          </div>
          <div class="witness-badges">
            <span class="${profile.isActive ? "active-status" : "inactive-status"}">${status}</span>
            <span>${escapeHtml(profile.staffType)}</span>
            <span>${escapeHtml(profile.latestPeriod)}</span>
          </div>
        </div>
        <p class="witness-org">${escapeHtml(profile.currentOffice || "Office not listed")}</p>
        <div class="staff-meta-row">
          <span>${fmt.format(profile.roleCount || 0)} role record${profile.roleCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(profile.officeCount || 0)} office${profile.officeCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(profile.titleCount || 0)} title${profile.titleCount === 1 ? "" : "s"}</span>
        </div>
        <div class="witness-link-row"><a href="${escapeHtml(profileHref(profile))}">Open profile</a></div>
      </div>
    </article>
  `;
}

function render() {
  const rows = filteredProfiles();
  els.heading.textContent = `${fmt.format(rows.length)} ${state.showInactive ? "staff profiles" : "active staff profiles"}`;
  els.visible.textContent = `${fmt.format(Math.min(rows.length, 120))} shown`;
  els.empty.hidden = rows.length > 0;
  els.grid.innerHTML = rows.slice(0, 120).map(renderProfile).join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  els.showInactive.addEventListener("change", (event) => {
    state.showInactive = event.target.checked;
    render();
  });
  els.type.addEventListener("change", (event) => {
    state.staffType = event.target.value;
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
renderFilters();
bindEvents();
render();
