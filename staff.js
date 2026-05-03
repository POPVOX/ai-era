const houseDirectory = window.HOUSE_STAFF_DATA || { totals: {}, filters: {}, profiles: [] };
const senateDirectory = window.SENATE_DISBURSEMENT_DATA || { metrics: {}, filters: {}, staffProfiles: [] };

const state = {
  search: "",
  chamber: "",
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
  chamber: document.querySelector("#staff-chamber-filter"),
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

function addCount(map, label, count = 1) {
  if (!label) return;
  map.set(label, (map.get(label) || 0) + count);
}

function topEntries(map, limit = 100) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function periodRank(period) {
  const value = String(period || "");
  const year = Number(value.match(/\b(20\d{2})\b/)?.[1] || 0);
  let quarter = 0;
  if (/jan|january/i.test(value)) quarter = 1;
  if (/apr|april/i.test(value)) quarter = 2;
  if (/jul|july/i.test(value)) quarter = 3;
  if (/oct|october/i.test(value)) quarter = 4;
  return year * 10 + quarter;
}

function normalizeHouseProfile(profile) {
  return {
    ...profile,
    chamber: "House",
    sourceKind: "House CSV",
    staffType: profile.staffType || "House staff",
    isActive: Boolean(profile.isActive),
    status: profile.isActive ? "Active" : "Inactive",
    roleCount: profile.roleCount || 0,
    profileUrl: `staffers/${encodeURIComponent(profile.slug)}.html`,
  };
}

function normalizeSenateProfile(profile) {
  const isActive = profile.latestPeriod === senateLatestPeriod;
  return {
    ...profile,
    chamber: "Senate",
    sourceKind: "Senate PDF",
    staffType: "Senate staff",
    isActive,
    status: isActive ? "Active" : "Inactive",
    roleCount: profile.rowCount || 0,
    sourceUrl: profile.rows?.[0]?.sourcePdfUrl || "",
  };
}

const senateLatestPeriod = [...new Set((senateDirectory.staffProfiles || []).map((profile) => profile.latestPeriod))]
  .sort((a, b) => periodRank(a) - periodRank(b))
  .at(-1) || "";

const profiles = [
  ...(houseDirectory.profiles || []).map(normalizeHouseProfile),
  ...(senateDirectory.staffProfiles || []).map(normalizeSenateProfile),
];

const periodOrder = new Map([...new Set(profiles.flatMap((profile) => profile.periods || []))]
  .sort((a, b) => periodRank(a) - periodRank(b))
  .map((period, index) => [period, index]));

const filters = {
  staffTypes: topEntries(profiles.reduce((map, profile) => {
    addCount(map, profile.staffType);
    return map;
  }, new Map())),
  periods: [...periodOrder.keys()],
  offices: topEntries(profiles.reduce((map, profile) => {
    for (const item of profile.topOffices || []) addCount(map, item.label, item.count || 1);
    if (!(profile.topOffices || []).length) addCount(map, profile.currentOffice);
    return map;
  }, new Map()), 80),
};

function profileText(profile) {
  return [
    profile.name,
    profile.chamber,
    profile.currentOffice,
    profile.currentTitle,
    profile.staffType,
    profile.latestPeriod,
    profile.sourceKind,
    profile.hasOverlapCaveat ? "Report period overlaps 2024/2025" : "",
    ...(profile.periods || []),
    ...(profile.topOffices || []).map((item) => item.label),
    ...(profile.topTitles || []).map((item) => item.label),
  ].join(" ").toLowerCase();
}

function matches(profile) {
  const query = state.search.trim().toLowerCase();
  if (!state.showInactive && !profile.isActive) return false;
  if (state.chamber && profile.chamber !== state.chamber) return false;
  if (state.staffType && profile.staffType !== state.staffType) return false;
  if (state.period && !(profile.periods || []).includes(state.period)) return false;
  if (!query) return true;
  return profileText(profile).includes(query);
}

function filteredProfiles() {
  const rows = profiles.filter(matches);
  rows.sort((a, b) => {
    if (state.sort === "recent") return (periodOrder.get(b.latestPeriod) ?? -1) - (periodOrder.get(a.latestPeriod) ?? -1) || a.name.localeCompare(b.name);
    if (state.sort === "roles") return (b.roleCount || 0) - (a.roleCount || 0) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderStats() {
  const activeCount = profiles.filter((profile) => profile.isActive).length;
  const offices = new Set(profiles.map((profile) => profile.currentOffice).filter(Boolean)).size;
  const titles = new Set(profiles.map((profile) => profile.currentTitle).filter(Boolean)).size;
  const rowCount = (houseDirectory.totals.payrollRows || 0) + (senateDirectory.metrics.staffRows || 0);
  const latest = [houseDirectory.generatedAt, senateDirectory.generatedAt].filter(Boolean).sort().at(-1);

  els.count.textContent = fmt.format(activeCount);
  els.offices.textContent = fmt.format(offices);
  els.titles.textContent = fmt.format(titles);
  els.rows.textContent = fmt.format(rowCount);
  els.updated.textContent = latest ? `Updated ${formatDate(latest)}` : "Local data";
}

function renderFilters() {
  for (const item of filters.staffTypes) {
    const option = document.createElement("option");
    option.value = item.label;
    option.textContent = `${item.label} (${fmt.format(item.count)})`;
    els.type.appendChild(option);
  }

  for (const period of filters.periods) {
    const option = document.createElement("option");
    option.value = period;
    option.textContent = period;
    els.period.appendChild(option);
  }

  els.officeList.innerHTML = `
    <p class="eyebrow">Top offices</p>
    ${filters.offices.slice(0, 10).map((office) => `
      <button type="button" data-office="${escapeHtml(office.label)}">
        <span>${escapeHtml(office.label.replace(/^HON\\. /, "").replace(/^SENATOR /, ""))}</span>
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

function applyInitialUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const search = params.get("search") || params.get("q") || "";
  const chamber = params.get("chamber") || "";
  const staffType = params.get("type") || "";
  const period = params.get("period") || "";
  const inactive = params.get("inactive") || params.get("showInactive") || "";

  if (search) {
    state.search = search;
    els.search.value = search;
  }
  if (chamber && [...els.chamber.options].some((option) => option.value === chamber)) {
    state.chamber = chamber;
    els.chamber.value = chamber;
  }
  if (staffType && [...els.type.options].some((option) => option.value === staffType)) {
    state.staffType = staffType;
    els.type.value = staffType;
  }
  if (period && [...els.period.options].some((option) => option.value === period)) {
    state.period = period;
    els.period.value = period;
  }
  if (/^(1|true|yes)$/i.test(inactive)) {
    state.showInactive = true;
    els.showInactive.checked = true;
  }
}

function renderProfile(profile) {
  const status = profile.isActive ? "Active" : "Inactive";
  const caveat = profile.hasOverlapCaveat ? '<span class="inactive-status">Report period overlaps 2024/2025</span>' : "";
  const name = profile.profileUrl
    ? `<a href="${escapeHtml(profile.profileUrl)}">${escapeHtml(profile.name)}</a>`
    : escapeHtml(profile.name);
  const openLink = profile.profileUrl
    ? `<div class="witness-link-row"><a href="${escapeHtml(profile.profileUrl)}">Open profile</a></div>`
    : "";

  return `
    <article class="staff-card ${profile.isActive ? "" : "inactive"}">
      <a class="witness-avatar" ${profile.profileUrl ? `href="${escapeHtml(profile.profileUrl)}"` : ""} aria-label="${escapeHtml(profile.name)} profile">${escapeHtml(initials(profile.name))}</a>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3>${name}</h3>
            <p>${escapeHtml(profile.currentTitle || "Title not listed")}</p>
          </div>
          <div class="witness-badges">
            <span class="${profile.isActive ? "active-status" : "inactive-status"}">${status}</span>
            <span>${escapeHtml(profile.chamber)}</span>
            <span>${escapeHtml(profile.sourceKind)}</span>
            <span>${escapeHtml(profile.staffType)}</span>
            ${caveat}
          </div>
        </div>
        <p class="witness-org">${escapeHtml(profile.currentOffice || "Office not listed")}</p>
        <div class="staff-meta-row">
          <span>${fmt.format(profile.roleCount || 0)} role record${profile.roleCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(profile.officeCount || 0)} office${profile.officeCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(profile.titleCount || 0)} title${profile.titleCount === 1 ? "" : "s"}</span>
          <span>${escapeHtml(profile.latestPeriod || "Period not listed")}</span>
        </div>
        ${openLink}
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
  els.chamber.addEventListener("change", (event) => {
    state.chamber = event.target.value;
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
applyInitialUrlFilters();
bindEvents();
render();
