const directory = window.LOBBYIST_EXPLORER_DATA || { totals: {}, filters: {}, profiles: [] };

const state = {
  search: "",
  year: "",
  status: "",
  sort: "filings",
};

const els = {
  updated: document.querySelector("#lobbyist-updated"),
  count: document.querySelector("#lobbyist-count"),
  filings: document.querySelector("#lobbyist-filing-count"),
  clients: document.querySelector("#lobbyist-client-count"),
  registrants: document.querySelector("#lobbyist-registrant-count"),
  search: document.querySelector("#lobbyist-search"),
  year: document.querySelector("#lobbyist-year-filter"),
  status: document.querySelector("#lobbyist-status-filter"),
  sort: document.querySelector("#lobbyist-sort"),
  clientList: document.querySelector("#lobbyist-client-list"),
  visible: document.querySelector("#lobbyist-visible-count"),
  heading: document.querySelector("#lobbyist-result-heading"),
  grid: document.querySelector("#lobbyist-grid"),
  empty: document.querySelector("#lobbyist-empty"),
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

function profileHref(profile) {
  return `lobbyists/${encodeURIComponent(profile.slug)}.html`;
}

function profileText(profile) {
  return [
    profile.name,
    profile.primaryClient,
    profile.primaryRegistrant,
    profile.latestYear,
    profile.latestPeriod,
    ...(profile.coveredPositions || []),
    ...(profile.topClients || []).map((item) => item.label),
    ...(profile.topRegistrants || []).map((item) => item.label),
  ].join(" ").toLowerCase();
}

function matches(profile) {
  const query = state.search.trim().toLowerCase();
  if (state.year && !(profile.years || []).map(String).includes(state.year)) return false;
  if (state.status === "covered" && !(profile.coveredPositions || []).length) return false;
  if (state.status === "multi-client" && profile.clientCount < 2) return false;
  if (!query) return true;
  return profileText(profile).includes(query);
}

function filteredProfiles() {
  const rows = directory.profiles.filter(matches);
  rows.sort((a, b) => {
    if (state.sort === "clients") return b.clientCount - a.clientCount || a.name.localeCompare(b.name);
    if (state.sort === "recent") return Number(b.latestYear || 0) - Number(a.latestYear || 0) || b.filingCount - a.filingCount || a.name.localeCompare(b.name);
    if (state.sort === "name") return a.name.localeCompare(b.name);
    return b.filingCount - a.filingCount || a.name.localeCompare(b.name);
  });
  return rows;
}

function renderStats() {
  els.count.textContent = fmt.format(directory.totals.lobbyists || 0);
  els.filings.textContent = fmt.format(directory.totals.filingLinks || 0);
  els.clients.textContent = fmt.format(directory.totals.clients || 0);
  els.registrants.textContent = fmt.format(directory.totals.registrants || 0);
  els.updated.textContent = directory.generatedAt ? `Updated ${formatDate(directory.generatedAt)}` : "Local data";
}

function renderFilters() {
  for (const year of directory.filters.years || []) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    els.year.appendChild(option);
  }

  els.clientList.innerHTML = `
    <p class="eyebrow">Top clients</p>
    ${(directory.filters.topClients || []).slice(0, 10).map((client) => `
      <button type="button" data-client="${escapeHtml(client.label)}">
        <span>${escapeHtml(client.label)}</span>
        <strong>${fmt.format(client.count)}</strong>
      </button>
    `).join("")}
  `;

  els.clientList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.search = button.dataset.client || "";
      els.search.value = state.search;
      render();
    });
  });
}

function renderProfile(profile) {
  return `
    <article class="lobbyist-card">
      <a class="witness-avatar lobbyist-avatar" href="${escapeHtml(profileHref(profile))}" aria-label="${escapeHtml(profile.name)} profile"><img src="assets/lobbyist-symbol.png" alt=""></a>
      <div class="staff-card-main">
        <div class="witness-card-head">
          <div>
            <h3><a href="${escapeHtml(profileHref(profile))}">${escapeHtml(profile.name)}</a></h3>
            <p>${escapeHtml(profile.primaryRegistrant || "Registrant relationships from LDA records")}</p>
          </div>
          <div class="witness-badges">
            <span>${fmt.format(profile.filingCount || 0)} filing link${profile.filingCount === 1 ? "" : "s"}</span>
            <span>${escapeHtml(String(profile.latestYear || "Year pending"))}</span>
          </div>
        </div>
        <p class="witness-org">${escapeHtml(profile.primaryClient || "Client not listed")}</p>
        ${(profile.coveredPositions || []).length ? `<p class="witness-bio">${escapeHtml(profile.coveredPositions[0])}</p>` : ""}
        <div class="staff-meta-row">
          <span>${fmt.format(profile.clientCount || 0)} client${profile.clientCount === 1 ? "" : "s"}</span>
          <span>${fmt.format(profile.registrantCount || 0)} registrant${profile.registrantCount === 1 ? "" : "s"}</span>
          <span>${escapeHtml(profile.latestPeriod || "Period pending")}</span>
        </div>
        <div class="witness-link-row"><a href="${escapeHtml(profileHref(profile))}">Open profile</a></div>
      </div>
    </article>
  `;
}

function render() {
  const rows = filteredProfiles();
  els.heading.textContent = `${fmt.format(rows.length)} lobbyist profiles`;
  els.visible.textContent = `${fmt.format(Math.min(rows.length, 120))} shown`;
  els.empty.hidden = rows.length > 0;
  els.grid.innerHTML = rows.slice(0, 120).map(renderProfile).join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  els.year.addEventListener("change", (event) => {
    state.year = event.target.value;
    render();
  });
  els.status.addEventListener("change", (event) => {
    state.status = event.target.value;
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
