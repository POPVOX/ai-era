import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "witness-directory", "data", "lda-normalized");
const outJson = path.join(root, "assets", "lobbyist-data.json");
const outJs = path.join(root, "assets", "lobbyist-data.js");
const outDir = path.join(root, "lobbyists");

function readJsonl(fileName) {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing LDA source file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

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
  return String(value || "lobbyist")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "lobbyist";
}

function titleCaseName(name) {
  const particles = new Set(["da", "de", "del", "der", "di", "du", "la", "le", "van", "von"]);
  return String(name || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token, index) => {
      const plain = token.replace(/[^a-z]/g, "");
      if (index > 0 && particles.has(plain)) return plain;
      if (/^[a-z]\.$/.test(token)) return token.toUpperCase();
      if (/^(ii|iii|iv|vi|vii|viii|ix|x)$/.test(plain)) return plain.toUpperCase();
      if (/^(jr|sr|esq)\.?$/.test(token)) return token.replace(/^[a-z]+/i, (part) => part.toUpperCase());
      return token
        .split(/([-'])/)
        .map((part) => (/[-']/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
    })
    .join(" ");
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

function filingRank(item) {
  const periodRank = {
    fourth_quarter: 4,
    third_quarter: 3,
    second_quarter: 2,
    first_quarter: 1,
    year_end: 5,
    mid_year: 2,
  };
  return (Number(item.filing_year) || 0) * 10 + (periodRank[item.filing_period] || 0);
}

function periodLabel(filing) {
  return filing?.filing_period_display || String(filing?.filing_period || "Period not listed").replace(/_/g, " ");
}

function addCount(map, key) {
  const clean = key || "Not listed";
  map.set(clean, (map.get(clean) || 0) + 1);
}

function topEntries(map, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function uniqueList(values, limit = 6) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
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
      <div class="nav-actions"><a class="button secondary" href="../lobbyists.html">Lobbyist Explorer</a><a class="button" href="mailto:info@popvox.com">Request a demo</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function renderProfile(profile) {
  const latest = profile.filings[0];
  const filingRows = profile.filings.slice(0, 300);
  const remaining = profile.filings.length - filingRows.length;
  const body = `<main class="lobbyist-profile-shell">
    <section class="witness-profile-hero lobbyist-profile-hero">
      <a class="back-link" href="../lobbyists.html">← Lobbyist Explorer</a>
      <div class="witness-profile-hero-grid">
        <div class="witness-profile-identity">
          <div class="witness-profile-avatar lobbyist-avatar"><img src="../assets/lobbyist-symbol.png" alt=""></div>
          <div>
            <p class="eyebrow">Registered Lobbyist Profile</p>
            <h1>${escapeHtml(profile.name)}<span>.</span></h1>
            <p>${escapeHtml(profile.primaryRegistrant || "Registrant relationships from LDA records")}</p>
            <strong>${escapeHtml(profile.primaryClient || "Clients listed in public filings")}</strong>
          </div>
        </div>
        <div class="witness-profile-badges">
          <span>${profile.filingCount} filing link${profile.filingCount === 1 ? "" : "s"}</span>
          <span>${profile.clientCount} client${profile.clientCount === 1 ? "" : "s"}</span>
          <span>${escapeHtml(latest ? `${latest.filing_year} ${periodLabel(latest)}` : "No filing period")}</span>
        </div>
      </div>
    </section>

    <section class="witness-profile-overview">
      <article>
        <p class="eyebrow">LDA source</p>
        <h2>Public registration and filing relationships</h2>
        <p>This page summarizes public Lobbying Disclosure Act records by lobbyist, client, registrant, filing period, and covered government position when listed. It is a research index, not an assertion about current employment or representation.</p>
      </article>
      <aside>
        <dl class="bill-meta-list">
          <div><dt>Lobbyist ID</dt><dd>${escapeHtml(profile.id)}</dd></div>
          <div><dt>Top registrant</dt><dd>${escapeHtml(profile.primaryRegistrant || "Not listed")}</dd></div>
          <div><dt>Top client</dt><dd>${escapeHtml(profile.primaryClient || "Not listed")}</dd></div>
          <div><dt>Covered positions</dt><dd>${profile.coveredPositions.length ? escapeHtml(profile.coveredPositions.join("; ")) : "None listed"}</dd></div>
        </dl>
      </aside>
    </section>

    <section class="witness-profile-section">
      <div class="directory-head"><div><p class="eyebrow">Relationships</p><h2>Top clients and registrants</h2></div><span>${profile.clientCount} clients</span></div>
      <div class="lobbyist-profile-columns">
        <article>
          <h3>Clients</h3>
          ${profile.topClients.map((item) => `<p><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></p>`).join("")}
        </article>
        <article>
          <h3>Registrants</h3>
          ${profile.topRegistrants.map((item) => `<p><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></p>`).join("")}
        </article>
      </div>
    </section>

    <section class="witness-profile-section">
      <div class="directory-head"><div><p class="eyebrow">Filings</p><h2>LDA filing links</h2></div><span>${profile.filingCount}</span></div>
      <div class="lobbyist-filing-list">
        ${filingRows.map((filing) => `<a href="${escapeHtml(filing.filing_document_url || filing.source_api_url || "#")}" target="_blank" rel="noopener">
          <strong>${escapeHtml(`${filing.filing_year} ${periodLabel(filing)}`)}</strong>
          <span>${escapeHtml(filing.client_name || "Client not listed")}</span>
          <small>${escapeHtml(filing.registrant_name || "Registrant not listed")}${filing.covered_position ? ` · ${escapeHtml(filing.covered_position)}` : ""}</small>
        </a>`).join("")}
      </div>
      ${remaining > 0 ? `<p class="source-note">Showing first ${filingRows.length} filing links by recency. ${remaining} additional links are in the generated data source.</p>` : ""}
    </section>
  </main>`;

  return pageShell({
    title: profile.name,
    description: `${profile.name} registered lobbyist profile with LDA filing relationships, clients, registrants, and covered positions.`,
    body,
  });
}

const lobbyists = readJsonl("lobbyists.jsonl");
const links = readJsonl("lobbyist-filing-links.jsonl");
const filings = new Map(readJsonl("filings.jsonl").map((item) => [item.filing_uuid, item]));

const people = new Map(lobbyists.map((lobbyist) => [lobbyist.lobbyist_id, {
  id: lobbyist.lobbyist_id,
  name: titleCaseName(lobbyist.name),
  firstName: titleCaseName(lobbyist.first_name || ""),
  lastName: titleCaseName(lobbyist.last_name || ""),
  links: [],
  clientCounts: new Map(),
  registrantCounts: new Map(),
  coveredPositions: new Set(),
}]));

for (const link of links) {
  const person = people.get(link.lobbyist_id);
  if (!person) continue;
  const filing = filings.get(link.filing_uuid) || {};
  const row = { ...filing, ...link };
  person.links.push(row);
  addCount(person.clientCounts, row.client_name);
  addCount(person.registrantCounts, row.registrant_name);
  if (row.covered_position) person.coveredPositions.add(row.covered_position);
}

const slugCounts = new Map();
const profiles = [...people.values()].map((person) => {
  const baseSlug = slugify(person.name);
  const count = slugCounts.get(baseSlug) || 0;
  slugCounts.set(baseSlug, count + 1);
  const slug = count ? `${baseSlug}-${person.id}` : baseSlug;
  const filingRows = person.links.sort((a, b) => filingRank(b) - filingRank(a) || String(b.dt_posted || "").localeCompare(String(a.dt_posted || "")));
  const topClients = topEntries(person.clientCounts, 10);
  const topRegistrants = topEntries(person.registrantCounts, 10);
  const latest = filingRows[0] || {};
  const years = [...new Set(filingRows.map((filing) => filing.filing_year).filter(Boolean))].sort((a, b) => b - a);
  return {
    slug,
    id: person.id,
    name: person.name,
    filingCount: filingRows.length,
    clientCount: person.clientCounts.size,
    registrantCount: person.registrantCounts.size,
    latestYear: latest.filing_year || "",
    years,
    latestPeriod: periodLabel(latest),
    primaryClient: topClients[0]?.label || "",
    primaryRegistrant: topRegistrants[0]?.label || "",
    coveredPositions: uniqueList([...person.coveredPositions], 5),
    topClients,
    topRegistrants,
    filings: filingRows,
  };
}).sort((a, b) => b.filingCount - a.filingCount || a.name.localeCompare(b.name));

const data = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "Lobbying Disclosure Act normalized data",
    lobbyists: lobbyists.length,
    filingLinks: links.length,
    filings: filings.size,
  },
  totals: {
    lobbyists: profiles.length,
    filingLinks: links.length,
    clients: new Set(links.map((link) => link.client_id).filter(Boolean)).size,
    registrants: new Set(links.map((link) => link.registrant_id).filter(Boolean)).size,
    coveredPositions: profiles.filter((profile) => profile.coveredPositions.length).length,
  },
  filters: {
    years: [...new Set(links.map((link) => link.filing_year).filter(Boolean))].sort((a, b) => b - a),
    topClients: topEntries(links.reduce((map, link) => {
      addCount(map, link.client_name);
      return map;
    }, new Map()), 80),
    topRegistrants: topEntries(links.reduce((map, link) => {
      addCount(map, link.registrant_name);
      return map;
    }, new Map()), 80),
  },
  profiles: profiles.map((profile) => ({
    slug: profile.slug,
    id: profile.id,
    name: profile.name,
    filingCount: profile.filingCount,
    clientCount: profile.clientCount,
    registrantCount: profile.registrantCount,
    latestYear: profile.latestYear,
    years: profile.years,
    latestPeriod: profile.latestPeriod,
    primaryClient: profile.primaryClient,
    primaryRegistrant: profile.primaryRegistrant,
    coveredPositions: profile.coveredPositions,
    topClients: profile.topClients.slice(0, 4),
    topRegistrants: profile.topRegistrants.slice(0, 4),
  })),
};

fs.writeFileSync(outJson, `${JSON.stringify(data)}\n`);
fs.writeFileSync(outJs, `window.LOBBYIST_EXPLORER_DATA = ${JSON.stringify(data)};\n`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = {};
for (const profile of profiles) {
  manifest[profile.id] = `lobbyists/${profile.slug}.html`;
  fs.writeFileSync(path.join(outDir, `${profile.slug}.html`), renderProfile(profile));
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Generated ${profiles.length.toLocaleString()} lobbyist profiles from ${links.length.toLocaleString()} LDA filing links.`);
