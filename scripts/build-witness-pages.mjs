import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "assets", "witness-directory-data.json");
const outDir = path.join(root, "witnesses");

const directory = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const profiles = directory.profiles || [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
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

function profileSlug(profile) {
  return slugify(profile.key || profile.displayName);
}

function uniqueProfileSlugs(rows) {
  const seen = new Map();
  const slugs = new Map();

  for (const profile of rows) {
    const base = profileSlug(profile);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    slugs.set(profile.key || profile.displayName, count ? `${base}-${count + 1}` : base);
  }

  return slugs;
}

const slugs = uniqueProfileSlugs(profiles);

function linkLabel(key) {
  return ({
    officialBio: "Official bio",
    organizationProfile: "Organization profile",
    photoSource: "Photo source",
    linkedin: "LinkedIn",
    scholar: "Scholar",
    orcid: "ORCID",
    hearing: "House hearing",
  })[key] || key.replace(/([A-Z])/g, " $1").trim();
}

function formatDate(value) {
  if (!value) return "Date pending";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function initials(name) {
  return String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function documentLinks(docs) {
  const rows = (docs || []).filter((doc) => doc.url);
  if (!rows.length) return "";
  return `<div class="witness-profile-docs">
    ${rows.map((doc) => `<a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener"><span>${escapeHtml(doc.type || "Document")}</span>${escapeHtml(doc.title || "Document")}</a>`).join("")}
  </div>`;
}

function renderLobbying(profile) {
  const matches = (profile.lobbyistMatches || []).filter((match) => match.url);
  if (!matches.length) return "";
  return `<section class="witness-profile-section lda">
    <div class="directory-head"><div><p class="eyebrow">Lobbying Disclosures</p><h2>Possible LDA matches</h2></div><span>${matches.length} match${matches.length === 1 ? "" : "es"}</span></div>
    <div class="witness-profile-disclosures">
      ${matches.map((match) => `<a href="${escapeHtml(match.url)}" target="_blank" rel="noopener">
        <strong>${escapeHtml(match.year || "LDA filing")}</strong>
        <span>${escapeHtml(match.client || "Client not listed")}</span>
        <small>${escapeHtml(match.registrant || "Registrant not listed")}</small>
      </a>`).join("")}
    </div>
  </section>`;
}

function renderLinks(profile) {
  const links = Object.entries(profile.links || {}).filter(([key, url]) => url && key !== "photo");
  if (!links.length) return "";
  return `<section class="witness-profile-section">
    <div class="directory-head"><div><p class="eyebrow">Links</p><h2>Public sources</h2></div><span>${links.length}</span></div>
    <div class="witness-profile-links">
      ${links.map(([key, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(linkLabel(key))}</a>`).join("")}
    </div>
  </section>`;
}

function renderAppearances(profile) {
  const appearances = profile.appearances || [];
  return `<section class="witness-profile-section">
    <div class="directory-head"><div><p class="eyebrow">Testimony</p><h2>Committee appearances</h2></div><span>${appearances.length} appearance${appearances.length === 1 ? "" : "s"}</span></div>
    ${appearances.length ? appearances.map((appearance) => `<article class="witness-profile-appearance">
      <div>
        <span>${escapeHtml(formatDate(appearance.date))}</span>
        <h3><a href="../events/${escapeHtml(appearance.eventId)}.html">${escapeHtml(appearance.hearingTitle || "Untitled hearing")}</a></h3>
        <p>${escapeHtml([appearance.committee, appearance.subcommittee].filter(Boolean).join(" / "))}</p>
        ${appearance.role ? `<small>${escapeHtml(appearance.role)}</small>` : ""}
      </div>
      <div class="witness-profile-actions">
        <a class="link-button" href="../events/${escapeHtml(appearance.eventId)}.html">Event page</a>
        ${appearance.sourceUrl ? `<a class="link-button muted" href="${escapeHtml(appearance.sourceUrl)}" target="_blank" rel="noopener">House event</a>` : ""}
      </div>
      ${documentLinks(appearance.documents)}
    </article>`).join("") : `<div class="empty-state">No committee appearances are listed yet.</div>`}
  </section>`;
}

function pageShell({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | ${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="../styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../about.html">About</a><a href="../team.html">Team</a><a href="../contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="../witnesses.html">Witness Explorer</a><a class="button" href="mailto:info@popvox.com">Request a demo</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function renderProfile(profile) {
  const photo = profile.links?.photo || "";
  const appearanceCount = profile.appearances?.length || profile.appearanceCount || 0;
  const latestAppearance = profile.appearances?.[0];
  const body = `<main class="witness-profile-shell">
    <section class="witness-profile-hero">
      <a class="back-link" href="../witnesses.html">← Witness Explorer</a>
      <div class="witness-profile-hero-grid">
        <div class="witness-profile-identity">
          <div class="witness-profile-avatar${photo ? " has-photo" : ""}">
            ${photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(initials(profile.displayName))}
          </div>
          <div>
            <p class="eyebrow">Witness Profile</p>
            <h1>${escapeHtml(profile.displayName)}<span>.</span></h1>
            <p>${escapeHtml(profile.title || "Role from hearing record")}</p>
            ${profile.organization ? `<strong>${escapeHtml(profile.organization)}</strong>` : ""}
          </div>
        </div>
        <div class="witness-profile-badges">
          <span>${appearanceCount} appearance${appearanceCount === 1 ? "" : "s"}</span>
          ${latestAppearance?.date ? `<span>Latest: ${escapeHtml(formatDate(latestAppearance.date))}</span>` : ""}
          ${profile.possibleLobbyist ? `<span class="coral"><img src="../assets/lobbyist-symbol.png" alt="">Possible LDA match</span>` : ""}
        </div>
      </div>
    </section>

    <section class="witness-profile-overview">
      <article>
        <p class="eyebrow">Bio</p>
        <h2>Profile</h2>
        <p>${escapeHtml(profile.bio || "No biography has been added yet. This page is ready to attach official bios, public profiles, testimony, and source materials as they are enriched.")}</p>
      </article>
      <aside>
        <dl class="bill-meta-list">
          <div><dt>Organization</dt><dd>${escapeHtml(profile.organization || "Not listed")}</dd></div>
          <div><dt>Confidence</dt><dd>${escapeHtml(profile.confidence || "Record match")}</dd></div>
          <div><dt>Documents</dt><dd>${profile.hasDocuments ? "Available" : "None listed yet"}</dd></div>
        </dl>
      </aside>
    </section>

    ${renderAppearances(profile)}
    ${renderLobbying(profile)}
    ${renderLinks(profile)}
  </main>`;

  return pageShell({
    title: profile.displayName,
    description: `${profile.displayName} witness profile with committee testimony, biography, documents, and public links.`,
    body,
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const manifest = {};
for (const profile of profiles) {
  const slug = slugs.get(profile.key || profile.displayName);
  manifest[profile.key || profile.displayName] = `witnesses/${slug}.html`;
  fs.writeFileSync(path.join(outDir, `${slug}.html`), renderProfile(profile));
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Generated ${profiles.length} witness profile pages.`);
