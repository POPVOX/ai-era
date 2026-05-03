const directory = window.WITNESS_DIRECTORY_DATA || { totals: {}, committees: [], profiles: [] };

const state = {
  search: "",
  committee: "",
  status: "",
  sort: "relevance",
};

const els = {
  updated: document.querySelector("#witness-updated"),
  witnessCount: document.querySelector("#witness-count"),
  appearanceCount: document.querySelector("#appearance-count"),
  committeeCount: document.querySelector("#committee-count"),
  lobbyistCount: document.querySelector("#lobbyist-count"),
  search: document.querySelector("#witness-search"),
  committee: document.querySelector("#witness-committee-filter"),
  status: document.querySelector("#witness-status-filter"),
  sort: document.querySelector("#witness-sort"),
  committeeList: document.querySelector("#committee-list"),
  grid: document.querySelector("#witness-grid"),
  empty: document.querySelector("#witness-empty"),
  visible: document.querySelector("#witness-visible-count"),
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
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function linkLabel(key) {
  return ({
    officialBio: "Official bio",
    organizationProfile: "Organization profile",
    photoSource: "Photo source",
    linkedin: "LinkedIn",
    scholar: "Scholar",
    orcid: "ORCID",
  })[key] || key.replace(/([A-Z])/g, " $1").trim();
}

function slugify(value) {
  return String(value || "witness")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "witness";
}

function profileHref(profile) {
  return `witnesses/${slugify(profile.key || profile.displayName)}.html`;
}

function profileText(profile) {
  return [
    profile.displayName,
    profile.title,
    profile.organization,
    profile.bio,
    profile.confidence,
    ...(profile.appearances || []).flatMap((appearance) => [
      appearance.committee,
      appearance.subcommittee,
      appearance.hearingTitle,
      appearance.role,
      ...(appearance.documents || []).map((doc) => doc.title),
    ]),
  ].join(" ").toLowerCase();
}

function getLatestDate(profile) {
  return (profile.appearances || [])[0]?.date || "";
}

function matchesStatus(profile) {
  if (!state.status) return true;
  if (state.status === "documents") return Boolean(profile.hasDocuments);
  if (state.status === "photos") return Boolean(profile.links?.photo);
  if (state.status === "lobbyist") return Boolean(profile.possibleLobbyist);
  return true;
}

function matchesCommittee(profile) {
  if (!state.committee) return true;
  return (profile.appearances || []).some((appearance) => appearance.committee === state.committee);
}

function scoreProfile(profile, query) {
  if (!query) return 0;
  const haystack = profileText(profile);
  let score = haystack.includes(query) ? 10 : 0;
  if (String(profile.displayName || "").toLowerCase().includes(query)) score += 20;
  if (String(profile.organization || "").toLowerCase().includes(query)) score += 8;
  return score;
}

function filteredProfiles() {
  const query = state.search.trim().toLowerCase();
  const rows = directory.profiles
    .map((profile) => ({ ...profile, _score: scoreProfile(profile, query) }))
    .filter((profile) => !query || profile._score > 0)
    .filter(matchesCommittee)
    .filter(matchesStatus);

  rows.sort((a, b) => {
    if (state.sort === "appearances") return b.appearanceCount - a.appearanceCount || a.displayName.localeCompare(b.displayName);
    if (state.sort === "recent") return String(getLatestDate(b)).localeCompare(String(getLatestDate(a))) || a.displayName.localeCompare(b.displayName);
    if (state.sort === "name") return a.displayName.localeCompare(b.displayName);
    return b._score - a._score || Number(Boolean(b.bio)) - Number(Boolean(a.bio)) || b.appearanceCount - a.appearanceCount || a.displayName.localeCompare(b.displayName);
  });

  return rows;
}

function renderStats() {
  els.witnessCount.textContent = fmt.format(directory.totals.witnesses || 0);
  els.appearanceCount.textContent = fmt.format(directory.totals.appearances || 0);
  els.committeeCount.textContent = fmt.format(directory.totals.committees || 0);
  els.lobbyistCount.textContent = fmt.format(directory.totals.possibleLobbyists || 0);
  els.updated.textContent = directory.generatedAt ? `Updated ${formatDate(directory.generatedAt.slice(0, 10))}` : "Local data";
}

function renderFilters() {
  for (const committee of directory.committees || []) {
    const option = document.createElement("option");
    option.value = committee.name;
    option.textContent = committee.name;
    els.committee.appendChild(option);
  }

  els.committeeList.innerHTML = `
    <p class="eyebrow">Top committees</p>
    ${(directory.committees || []).slice(0, 8).map((committee) => `
      <button type="button" data-committee="${escapeHtml(committee.name)}">
        <span>${escapeHtml(committee.name.replace(/^Committee on /, ""))}</span>
        <strong>${fmt.format(committee.count)}</strong>
      </button>
    `).join("")}
  `;

  els.committeeList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.committee = button.dataset.committee || "";
      els.committee.value = state.committee;
      render();
    });
  });
}

function witnessDocsForAppearance(profile, appearance) {
  return (appearance.documents || []).filter((doc) => doc.url);
}

function renderLobbyingMatches(profile) {
  const matches = (profile.lobbyistMatches || []).filter((match) => match.url);
  if (!matches.length) return "";

  return `
    <details class="lobbying-disclosures">
      <summary>Lobbying disclosures: ${fmt.format(matches.length)} possible match${matches.length === 1 ? "" : "es"}</summary>
      <div class="lobbying-list">
        ${matches.slice(0, 5).map((match) => `
          <a href="${escapeHtml(match.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(match.year || "LDA filing")}</strong>
            <span>${escapeHtml(match.client || "Client not listed")}</span>
            <small>${escapeHtml(match.registrant || "Registrant not listed")}</small>
          </a>
        `).join("")}
      </div>
    </details>
  `;
}

function renderProfile(profile) {
  const links = Object.entries(profile.links || {}).filter(([key, url]) => url && key !== 'photo');
  const initials = String(profile.displayName || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const photo = profile.links?.photo || "";

  return `
    <article class="witness-card">
      <a class="witness-avatar${photo ? " has-photo" : ""}" href="${escapeHtml(profileHref(profile))}" aria-label="${escapeHtml(profile.displayName)} profile">
        ${photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(initials)}
      </a>
      <div class="witness-card-main">
        <div class="witness-card-head">
          <div>
            <h3><a href="${escapeHtml(profileHref(profile))}">${escapeHtml(profile.displayName)}</a></h3>
            <p>${escapeHtml(profile.title || profile.organization || "Role from hearing record")}</p>
          </div>
          <div class="witness-badges">
            <span>${fmt.format(profile.appearanceCount || 0)} appearance${profile.appearanceCount === 1 ? "" : "s"}</span>
            ${profile.possibleLobbyist ? "<span class=\"coral lobbyist-badge\"><img src=\"assets/lobbyist-symbol.png\" alt=\"\">Possible LDA match</span>" : ""}
          </div>
        </div>

        ${profile.organization ? `<p class="witness-org">${escapeHtml(profile.organization)}</p>` : ""}
        ${profile.bio ? `<p class="witness-bio">${escapeHtml(profile.bio)}</p>` : ""}

        <div class="witness-link-row">
          ${links.slice(0, 4).map(([key, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(linkLabel(key))}</a>`).join("")}
        </div>

        ${renderLobbyingMatches(profile)}

        ${(profile.appearances || []).length ? `
          <details class="witness-appearances">
            <summary>Hearings: ${fmt.format((profile.appearances || []).length)} appearance${(profile.appearances || []).length === 1 ? '' : 's'}</summary>
            ${(profile.appearances || []).slice(0, 5).map((appearance) => `
              <div class="witness-appearance">
                <strong>${escapeHtml(formatDate(appearance.date))}</strong>
                <span>${escapeHtml(appearance.hearingTitle || "Untitled hearing")}</span>
                <small>${escapeHtml([appearance.committee, appearance.subcommittee].filter(Boolean).join(" / "))}</small>
                ${(() => { const ownDocs = witnessDocsForAppearance(profile, appearance); return ownDocs.length ? `
                  <div class="witness-appearance-docs">
                    ${ownDocs.map((doc) => `<a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.title || "Document")}</a>`).join("")}
                  </div>
                ` : ""; })()}
              </div>
            `).join("")}
          </details>
        ` : ""}
      </div>
    </article>
  `;
}

function render() {
  const rows = filteredProfiles();
  els.visible.textContent = `${fmt.format(rows.length)} visible`;
  els.empty.hidden = rows.length > 0;
  els.grid.innerHTML = rows.slice(0, 80).map(renderProfile).join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  els.committee.addEventListener("change", (event) => {
    state.committee = event.target.value;
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
const initialParams = new URLSearchParams(window.location.search);
const requestedPerson = initialParams.get("person");
if (requestedPerson) {
  const decodedPerson = requestedPerson.toLowerCase();
  const requestedProfile = directory.profiles.find((profile) => (
    String(profile.key || "").toLowerCase() === decodedPerson
    || String(profile.displayName || "").toLowerCase() === decodedPerson
  ));
  state.search = requestedProfile?.displayName || requestedPerson;
  els.search.value = state.search;
  state.sort = "relevance";
  els.sort.value = "relevance";
}
bindEvents();
render();
