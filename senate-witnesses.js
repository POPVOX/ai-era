const data = window.SENATE_WITNESS_DATA || { totals: {}, profiles: [], hearings: [] };

const state = {
  search: "",
  status: "",
  sort: "relevance",
};

const els = {
  updated: document.querySelector("#senate-witness-updated"),
  witnessCount: document.querySelector("#senate-witness-count"),
  appearanceCount: document.querySelector("#senate-appearance-count"),
  hearingCount: document.querySelector("#senate-hearing-count"),
  researchCount: document.querySelector("#senate-research-count"),
  search: document.querySelector("#senate-witness-search"),
  status: document.querySelector("#senate-witness-status"),
  sort: document.querySelector("#senate-witness-sort"),
  hearingList: document.querySelector("#senate-witness-hearing-list"),
  heading: document.querySelector("#senate-witness-heading"),
  visible: document.querySelector("#senate-witness-visible"),
  grid: document.querySelector("#senate-witness-grid"),
  empty: document.querySelector("#senate-witness-empty"),
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
  if (!value) return "Date pending";
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
    profile.displayName,
    profile.title,
    profile.organization,
    profile.enrichmentStatus,
    ...(profile.sourceLines || []),
    ...(profile.appearances || []).flatMap((appearance) => [
      appearance.title,
      appearance.committee?.name,
      appearance.packageId,
      appearance.role,
      appearance.organization,
    ]),
  ].join(" ").toLowerCase();
}

function getLatestDate(profile) {
  return (profile.appearances || [])[0]?.date || (profile.appearances || [])[0]?.dateIssued || "";
}

function scoreProfile(profile, query) {
  if (!query) return 0;
  const haystack = profileText(profile);
  let score = haystack.includes(query) ? 10 : 0;
  if (String(profile.displayName || "").toLowerCase().includes(query)) score += 25;
  if (String(profile.organization || "").toLowerCase().includes(query)) score += 10;
  return score;
}

function matchesStatus(profile) {
  if (!state.status) return true;
  if (state.status === "multi") return (profile.appearanceCount || 0) > 1;
  if (state.status === "research") return profile.enrichmentStatus === "research-needed";
  if (state.status === "docs") return (profile.appearances || []).some((appearance) => appearance.pdfUrl || appearance.htmlUrl);
  return true;
}

function filteredProfiles() {
  const query = state.search.trim().toLowerCase();
  const rows = (data.profiles || [])
    .map((profile) => ({ ...profile, _score: scoreProfile(profile, query) }))
    .filter((profile) => !query || profile._score > 0)
    .filter(matchesStatus);

  rows.sort((a, b) => {
    if (state.sort === "appearances") return (b.appearanceCount || 0) - (a.appearanceCount || 0) || a.displayName.localeCompare(b.displayName);
    if (state.sort === "recent") return String(getLatestDate(b)).localeCompare(String(getLatestDate(a))) || a.displayName.localeCompare(b.displayName);
    if (state.sort === "name") return a.displayName.localeCompare(b.displayName);
    return b._score - a._score || (b.appearanceCount || 0) - (a.appearanceCount || 0) || a.displayName.localeCompare(b.displayName);
  });
  return rows;
}

function renderStats() {
  els.updated.textContent = data.generatedAt ? `Updated ${formatDate(data.generatedAt)}` : "Local prototype";
  els.witnessCount.textContent = fmt.format(data.totals.witnesses || 0);
  els.appearanceCount.textContent = fmt.format(data.totals.appearances || 0);
  els.hearingCount.textContent = fmt.format(data.totals.hearings || 0);
  els.researchCount.textContent = fmt.format(data.totals.researchNeeded || 0);
}

function renderHearingList() {
  const hearings = (data.hearings || []).filter((hearing) => hearing.witnessCount).slice(0, 10);
  els.hearingList.innerHTML = `<p class="eyebrow">Recent published hearings</p>${hearings.map((hearing) => `
    <a class="senate-source-row" href="${escapeHtml(hearing.localUrl || hearing.detailsUrl)}"${hearing.localUrl ? "" : " target=\"_blank\" rel=\"noopener\""}>
      <span>${escapeHtml(formatDate(hearing.date || hearing.dateIssued))}</span>
      <strong>${escapeHtml(hearing.title)}</strong>
      <small>${fmt.format(hearing.witnessCount)} witnesses</small>
    </a>
  `).join("")}`;
}

function renderResearchLinks(profile) {
  const links = profile.links || {};
  return `<div class="witness-link-row">
    ${links.webSearch ? `<a href="${escapeHtml(links.webSearch)}" target="_blank" rel="noopener">Web</a>` : ""}
    ${links.linkedinSearch ? `<a href="${escapeHtml(links.linkedinSearch)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
    ${links.googleScholarSearch ? `<a href="${escapeHtml(links.googleScholarSearch)}" target="_blank" rel="noopener">Scholar</a>` : ""}
    ${links.imageSearch ? `<a href="${escapeHtml(links.imageSearch)}" target="_blank" rel="noopener">Image</a>` : ""}
  </div>`;
}

function renderProfile(profile) {
  const latest = (profile.appearances || [])[0];
  return `<article class="witness-card senate-witness-card">
    <a class="witness-avatar" href="${escapeHtml(profile.profileUrl)}" aria-label="${escapeHtml(profile.displayName)} profile">${escapeHtml(initials(profile.displayName))}</a>
    <div class="witness-card-main">
      <div class="witness-card-head">
        <div>
          <h3><a href="${escapeHtml(profile.profileUrl)}">${escapeHtml(profile.displayName)}</a></h3>
          <p>${escapeHtml(profile.title || profile.organization || "Role from published hearing")}</p>
        </div>
        <div class="witness-badges">
          <span>${fmt.format(profile.appearanceCount || 0)} appearance${profile.appearanceCount === 1 ? "" : "s"}</span>
          <span class="navy">GovInfo</span>
        </div>
      </div>
      ${profile.organization ? `<p class="witness-org">${escapeHtml(profile.organization)}</p>` : ""}
      <p class="witness-bio">Extracted from published Senate hearing text. Verified bio, photo, LinkedIn, and Scholar links can be attached as enrichment proceeds.</p>
      ${renderResearchLinks(profile)}
      ${latest ? `<details class="witness-appearances">
        <summary>Latest hearing: ${escapeHtml(formatDate(latest.date || latest.dateIssued))}</summary>
        <div class="witness-appearance">
          <strong>${escapeHtml(latest.packageId || "GovInfo")}</strong>
          <span>${escapeHtml(latest.title || "Published Senate hearing")}</span>
          <small>${escapeHtml(latest.role || "")}</small>
          <div class="witness-appearance-docs">
            ${latest.localUrl ? `<a href="${escapeHtml(latest.localUrl)}">Event page</a>` : ""}
            ${latest.detailsUrl ? `<a href="${escapeHtml(latest.detailsUrl)}" target="_blank" rel="noopener">GovInfo</a>` : ""}
            ${latest.pdfUrl ? `<a href="${escapeHtml(latest.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : ""}
            ${latest.htmlUrl ? `<a href="${escapeHtml(latest.htmlUrl)}" target="_blank" rel="noopener">HTML</a>` : ""}
          </div>
        </div>
      </details>` : ""}
    </div>
  </article>`;
}

function render() {
  const rows = filteredProfiles();
  els.heading.textContent = `${fmt.format(rows.length)} Senate witnesses`;
  els.visible.textContent = `${fmt.format(rows.length)} visible`;
  els.empty.hidden = rows.length > 0;
  els.grid.innerHTML = rows.slice(0, 100).map(renderProfile).join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
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
renderHearingList();
bindEvents();
render();
