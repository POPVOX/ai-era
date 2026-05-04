import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const profilesDir = path.join(root, "senate-witnesses");
const eventsDir = path.join(root, "senate-events");
const govInfoApiKey = process.env.GOVINFO_API_KEY || "DEMO_KEY";
const congresses = (process.env.SENATE_WITNESS_CONGRESSES || "119")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const pageSize = Number(process.env.SENATE_WITNESS_PAGE_SIZE || 100);
const maxHearings = Number(process.env.SENATE_WITNESS_MAX_HEARINGS || 260);
const searchEndpoint = process.env.GOVINFO_SEARCH_ENDPOINT || "https://api.govinfo.gov/search";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function cleanText(value = "") {
  return decodeEntities(String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n"))
    .trim();
}

function normalizeSpaces(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function directContentUrl(apiUrl = "") {
  return String(apiUrl)
    .replace("https://api.govinfo.gov/packages/", "https://www.govinfo.gov/content/pkg/")
    .replace(/\/granules\/([^/]+)\/htm$/, "/html/$1.htm")
    .replace(/\/granules\/([^/]+)\/pdf$/, "/pdf/$1.pdf");
}

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function googleScholarUrl(query) {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;
}

function linkedInSearchUrl(query) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function imageSearchUrl(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function eventSlug(hearing) {
  return slugify(hearing.packageId || hearing.granuleId || hearing.title || "senate-hearing");
}

function eventLocalUrl(hearing) {
  return `senate-events/${eventSlug(hearing)}.html`;
}

function parseDateFromText(text) {
  const months = "JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER";
  const match = text.match(new RegExp(`\\b(${months})\\s+\\d{1,2},\\s+20\\d{2}\\b`, "i"));
  if (!match) return "";
  const date = new Date(`${match[0]} 12:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function extractPreText(html) {
  const pre = String(html || "").match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] || html;
  return cleanText(pre);
}

function stripDotLeader(value) {
  return normalizeSpaces(String(value || "")
    .replace(/\.{2,}\s*\d+\s*$/g, "")
    .replace(/\s+\d+\s*$/g, ""));
}

function isHeading(value) {
  const text = normalizeSpaces(value).toUpperCase();
  return !text
    || text === "PANEL OF WITNESSES"
    || text === "WITNESSES"
    || text === "APPENDIX"
    || text === "PREPARED WITNESS STATEMENTS"
    || text === "QUESTIONS FOR THE RECORD"
    || text.startsWith("OPENING STATEMENT")
    || text.startsWith("STATEMENT OF SENATOR")
    || text.startsWith("PREPARED STATEMENT")
    || text.startsWith("BIOGRAPHICAL")
    || text.startsWith("RESPONSES TO")
    || text.startsWith("RESPONSE TO")
    || text.startsWith("POST-HEARING")
    || text.startsWith("PRE-HEARING")
    || text.startsWith("LETTER OF")
    || text.startsWith("LETTERS OF")
    || text.startsWith("SUBMITTED MATERIAL")
    || text.startsWith("ADDITIONAL MATERIAL");
}

function splitWitnessItem(item) {
  const cleaned = stripDotLeader(item)
    .replace(/^Hon\.\s+/i, "Hon. ")
    .replace(/^\(cont\.\)\s*/i, "")
    .replace(/^Panel\s+[IVX]+\s+/i, "")
    .replace(/\s+,/g, ",")
    .trim();
  if (!cleaned || isHeading(cleaned)) return null;
  if (/^(opening statement|statement of|prepared statement|letter from|letters? of|response to|responses to|questions for|additional|addendum|biographical|professional information|alphabetical listing|alphabetical list|committee inserts|page\s+)/i.test(cleaned)) return null;
  if (!/[A-Za-z]{2,}/.test(cleaned)) return null;

  const firstComma = cleaned.indexOf(",");
  let displayName = firstComma > 0 ? cleaned.slice(0, firstComma).trim() : cleaned.trim();
  displayName = displayName.replace(/^\(?cont\.?\)?\s*/i, "").trim();
  displayName = displayName.replace(/\s+to be\s+.*$/i, "").trim();
  displayName = displayName.replace(/^testimony of\s+/i, "").trim();
  if (displayName.split(/\s+/).length > 7 || displayName.length > 80) return null;
  if (displayName.split(/\s+/).length < 2 && !/^(Dr\.|Mr\.|Ms\.|Mrs\.|Hon\.)/i.test(displayName)) return null;
  if (/^(witnesses|biographical information|responses|questions|appendix|committee|subcommittee|senator|thursday|tuesday|wednesday|monday|friday|saturday|sunday)$/i.test(displayName)) return null;
  if (/^(senator|accompanied by|addendum|advancing|advocates?|american\s|association\s|committee inserts|page\s|alphabetical list|the national|the nature|the wilderness|joint prepared statement|letter to|magazine article|fact sheet|staff report|supplemental|open hearing|ccp cheers|citizens for|energy environment|hunton|merced irrigation|nature sustainability|ppi radically|vaulted deep)/i.test(displayName)) return null;
  if (/: testimony$/i.test(displayName)) return null;
  if (/^(article:|article\s)/i.test(displayName)) return null;
  if (/\b(association|alliance|coalition|council|center|centre|institute|laboratory|lab|university|college|foundation|corporation|company|inc\.?|llc|project|conservancy|society|federation|chamber of commerce|department|network|portfolio|journal|report|brief|material|edison|advocacy|environmental|transportation|hydropower|geothermal|oceantic|builders|contractors)\b/i.test(displayName) && !/^(Dr\.|Mr\.|Ms\.|Mrs\.|Hon\.|The Honorable)/i.test(displayName)) return null;
  if (/^[A-Z0-9\s&'.-]{12,}$/.test(displayName) && !/^(Dr\.|Mr\.|Ms\.|Mrs\.|Hon\.|The Honorable)/.test(displayName)) return null;
  let role = firstComma > 0 ? normalizeSpaces(cleaned.slice(firstComma + 1)) : "";
  role = role.replace(/\s+\d+\s+(?=(Dr\.|Mr\.|Ms\.|Mrs\.|Hon\.|[A-Z][a-z]+ [A-Z]))[\s\S]*$/, "").trim();
  if (/^(communications|prepared statements?|post-hearing questions|pre-hearing questions)$/i.test(role)) return null;
  const parts = role.split(/,\s+/);
  let organization = "";
  if (parts.length > 1) {
    organization = parts.slice(-2).join(", ");
  } else {
    organization = role;
  }
  return {
    displayName,
    role,
    organization: organization.length > 140 ? "" : organization,
    sourceLine: cleaned,
  };
}

function extractCommitteeFromText(text) {
  const front = text.slice(0, 5000);
  const match = front.match(/BEFORE THE\s+([\s\S]{10,900}?)\s+UNITED STATES SENATE/i);
  if (!match) return { name: "Senate committee", authorityId: "", inferred: true };
  const name = normalizeSpaces(match[1])
    .replace(/\s{2,}/g, " ")
    .replace(/^THE\s+/i, "")
    .replace(/\bONE HUNDRED [\s\S]*$/i, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOn\b/g, "on")
    .replace(/\bOf\b/g, "of");
  return { name: name || "Senate committee", authorityId: "", inferred: false };
}

function extractSection(text, startPatterns, stopPatterns, maxLength = 9000) {
  const upper = text.toUpperCase();
  const starts = startPatterns
    .map((pattern) => upper.indexOf(pattern.toUpperCase()))
    .filter((idx) => idx >= 0);
  if (!starts.length) return "";
  const start = Math.min(...starts);
  let end = Math.min(text.length, start + maxLength);
  for (const pattern of stopPatterns) {
    const idx = upper.indexOf(pattern.toUpperCase(), start + 20);
    if (idx > start && idx < end) end = idx;
  }
  return text.slice(start, end);
}

function tocItems(section) {
  const lines = section.split("\n").map((line) => line.trimEnd());
  const items = [];
  let buffer = "";
  for (const line of lines) {
    const compact = normalizeSpaces(line);
    if (!compact) {
      if (buffer) buffer += " ";
      continue;
    }
    if (isHeading(compact)) continue;
    buffer = normalizeSpaces(`${buffer} ${compact}`);
    if (/\.{2,}\s*\d+\s*$/.test(buffer) || /\s{2,}\d+\s*$/.test(line)) {
      items.push(buffer);
      buffer = "";
    }
  }
  if (buffer) items.push(buffer);
  return items;
}

function extractWitnesses(text) {
  const frontMatter = text.slice(0, 26000);
  const hasPanel = /(^|\n)\s*PANEL OF WITNESSES\s*(\n|$)/i.test(frontMatter);
  const hasWitnessHeading = /(^|\n)\s*WITNESSES\s*(\n|$)/i.test(frontMatter);
  if (!hasPanel && !hasWitnessHeading) return [];

  const contents = extractSection(
    frontMatter,
    hasPanel ? ["PANEL OF WITNESSES"] : ["WITNESSES"],
    ["APPENDIX", "Prepared Witness Statements", "Questions for the Record", "SUBMISSIONS FOR THE RECORD", "LETTERS", "OPENING STATEMENT"],
    12000,
  );
  let rows = tocItems(contents).map(splitWitnessItem).filter(Boolean);

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.displayName}|${row.role}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function govInfoSearch(congress) {
  const rows = [];
  let offsetMark = "*";
  while (rows.length < maxHearings) {
    const url = new URL(searchEndpoint);
    url.searchParams.set("api_key", govInfoApiKey);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        query: `collection:chrg and chamber:senate and congress:${congress}`,
        pageSize: String(Math.min(pageSize, maxHearings - rows.length)),
        offsetMark,
        sorts: [{ field: "publishdate", sortOrder: "DESC" }],
      }),
    });
    if (!response.ok) throw new Error(`GovInfo search failed for ${congress}: ${response.status}`);
    const payload = await response.json();
    rows.push(...(payload.results || []));
    if (!payload.offsetMark || payload.offsetMark === offsetMark || !(payload.results || []).length) break;
    offsetMark = payload.offsetMark;
  }
  return rows.slice(0, maxHearings);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "POPVOX Senate Witness Explorer prototype" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function appearanceFromResult(result, text, witnesses) {
  const htmlUrl = directContentUrl(result.download?.txtLink || "");
  const pdfUrl = directContentUrl(result.download?.pdfLink || "");
  const heldDate = parseDateFromText(text) || result.dateIssued || "";
  return {
    eventId: "",
    source: "GovInfo",
    chamber: "Senate",
    congress: String(result.packageId || "").match(/CHRG-(\d+)/)?.[1] || "",
    date: heldDate,
    dateIssued: result.dateIssued || "",
    title: result.title || "Published Senate hearing",
    packageId: result.packageId || "",
    granuleId: result.granuleId || result.packageId || "",
    jacketId: String(result.packageId || "").replace(/^CHRG-\d+shrg/, ""),
    detailsUrl: `https://www.govinfo.gov/app/details/${result.packageId}/${result.granuleId || result.packageId}`,
    htmlUrl,
    pdfUrl,
    resultLink: result.resultLink || "",
    relatedLink: result.relatedLink || "",
    committee: extractCommitteeFromText(text),
    witnessCount: witnesses.length,
    localUrl: `senate-events/${slugify(result.packageId || result.granuleId || result.title || "senate-hearing")}.html`,
  };
}

function profileKey(name) {
  return slugify(name);
}

function mergeProfile(profiles, witness, appearance) {
  const key = profileKey(witness.displayName);
  if (!profiles.has(key)) {
    const query = `${witness.displayName} ${witness.organization || witness.role || ""}`.trim();
    profiles.set(key, {
      key,
      chamber: "Senate",
      displayName: witness.displayName,
      title: witness.role,
      organization: witness.organization,
      bio: "",
      links: {
        linkedinSearch: linkedInSearchUrl(query),
        googleScholarSearch: googleScholarUrl(query),
        webSearch: googleSearchUrl(query),
        imageSearch: imageSearchUrl(query),
      },
      verifiedLinks: {},
      enrichmentStatus: "research-needed",
      appearances: [],
      appearanceCount: 0,
      sourceLines: [],
    });
  }
  const profile = profiles.get(key);
  if (!profile.title && witness.role) profile.title = witness.role;
  if (!profile.organization && witness.organization) profile.organization = witness.organization;
  profile.sourceLines.push(witness.sourceLine);
  profile.appearances.push({
    ...appearance,
    role: witness.role,
    organization: witness.organization,
    documents: [
      { title: "GovInfo HTML", type: "hearing_html", url: appearance.htmlUrl },
      { title: "GovInfo PDF", type: "hearing_pdf", url: appearance.pdfUrl },
    ].filter((doc) => doc.url),
  });
  profile.appearanceCount = profile.appearances.length;
}

function makeCommittees(hearings) {
  const byName = new Map();
  for (const hearing of hearings) {
    const name = hearing.committee?.name || "Senate committee";
    const row = byName.get(name) || { name, count: 0 };
    row.count += 1;
    byName.set(name, row);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function profilePage(profile) {
  const latest = profile.appearances[0];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | ${escapeHtml(profile.displayName)}</title>
  <meta name="description" content="${escapeHtml(profile.displayName)} Senate witness profile with published hearing appearances and source links.">
  <link rel="stylesheet" href="../styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../about.html">About</a><a href="../team.html">Team</a><a href="../contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="../senate-witnesses.html">Senate Witness Explorer</a></div>
    </nav>
  </header>
  <main class="witness-profile-shell senate-profile-shell">
    <section class="witness-profile-hero">
      <a class="back-link" href="../senate-witnesses.html">← Senate Witness Explorer</a>
      <div class="witness-profile-hero-grid">
        <div class="witness-profile-identity">
          <div class="witness-profile-avatar">${escapeHtml(profile.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</div>
          <div>
            <p class="eyebrow">Senate Witness Profile</p>
            <h1>${escapeHtml(profile.displayName)}<span>.</span></h1>
            <p>${escapeHtml(profile.title || "Role from published hearing")}</p>
            ${profile.organization ? `<strong>${escapeHtml(profile.organization)}</strong>` : ""}
          </div>
        </div>
        <div class="witness-profile-badges">
          <span>${profile.appearanceCount} appearance${profile.appearanceCount === 1 ? "" : "s"}</span>
          ${latest?.date ? `<span>Latest: ${escapeHtml(latest.date)}</span>` : ""}
          <span>GovInfo source</span>
        </div>
      </div>
    </section>
    <section class="witness-profile-overview">
      <article>
        <p class="eyebrow">Profile enrichment</p>
        <h2>Research queue</h2>
        <p>This profile is built from published Senate hearing text on GovInfo. LinkedIn, Google Scholar, official bio, and photo fields are intentionally left as research targets until a human-verified source is attached.</p>
      </article>
      <aside>
        <dl class="bill-meta-list">
          <div><dt>Source</dt><dd>GovInfo Congressional Hearings</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(profile.enrichmentStatus)}</dd></div>
          <div><dt>Chamber</dt><dd>Senate</dd></div>
        </dl>
      </aside>
    </section>
    <section class="witness-profile-section">
      <div class="directory-head"><div><p class="eyebrow">Research links</p><h2>Enrichment starting points</h2></div><span>4 links</span></div>
      <div class="witness-profile-links">
        <a href="${escapeHtml(profile.links.webSearch)}" target="_blank" rel="noopener">Web search</a>
        <a href="${escapeHtml(profile.links.linkedinSearch)}" target="_blank" rel="noopener">LinkedIn search</a>
        <a href="${escapeHtml(profile.links.googleScholarSearch)}" target="_blank" rel="noopener">Google Scholar search</a>
        <a href="${escapeHtml(profile.links.imageSearch)}" target="_blank" rel="noopener">Image search</a>
      </div>
    </section>
    <section class="witness-profile-section">
      <div class="directory-head"><div><p class="eyebrow">Testimony</p><h2>Published Senate hearings</h2></div><span>${profile.appearanceCount}</span></div>
      ${profile.appearances.map((appearance) => `<article class="witness-profile-appearance">
        <div>
          <span>${escapeHtml(appearance.date || appearance.dateIssued || "Date pending")}</span>
          <h3><a href="../${escapeHtml(appearance.localUrl || eventLocalUrl(appearance))}">${escapeHtml(appearance.title)}</a></h3>
          <p>${escapeHtml(appearance.committee?.name || "Senate committee")}</p>
          ${appearance.role ? `<small>${escapeHtml(appearance.role)}</small>` : ""}
        </div>
        <div class="witness-profile-actions">
          <a class="link-button" href="../${escapeHtml(appearance.localUrl || eventLocalUrl(appearance))}">Event page</a>
          <a class="link-button" href="${escapeHtml(appearance.detailsUrl)}" target="_blank" rel="noopener">GovInfo</a>
          ${appearance.pdfUrl ? `<a class="link-button muted" href="${escapeHtml(appearance.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : ""}
          ${appearance.htmlUrl ? `<a class="link-button muted" href="${escapeHtml(appearance.htmlUrl)}" target="_blank" rel="noopener">HTML</a>` : ""}
        </div>
      </article>`).join("")}
    </section>
  </main>
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function renderSenateEventWitness(witness) {
  return `<article class="event-witness-card">
    <a class="event-witness-avatar" href="../${escapeHtml(witness.profileUrl || "senate-witnesses.html")}">${escapeHtml(witness.initials)}</a>
    <div>
      <div class="event-witness-head">
        <div>
          <h3><a href="../${escapeHtml(witness.profileUrl || "senate-witnesses.html")}">${escapeHtml(witness.displayName)}</a></h3>
          <p>${escapeHtml(witness.role || witness.organization || "Role from published hearing")}</p>
          ${witness.organization && witness.organization !== witness.role ? `<span>${escapeHtml(witness.organization)}</span>` : ""}
        </div>
        <span class="event-badge">GovInfo extract</span>
      </div>
    </div>
  </article>`;
}

function senateEventPage(hearing) {
  const witnesses = hearing.witnesses || [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | ${escapeHtml(hearing.title)}</title>
  <meta name="description" content="${escapeHtml(hearing.title)} Senate hearing page with GovInfo source documents and witnesses.">
  <link rel="stylesheet" href="../styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../about.html">About</a><a href="../team.html">Team</a><a href="../contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="../senate-witnesses.html">Senate Witness Explorer</a></div>
    </nav>
  </header>
  <main class="event-shell senate-event-shell">
    <section class="event-hero">
      <a class="back-link" href="../senate-witnesses.html">← Senate Witness Explorer</a>
      <p class="eyebrow">Published Senate hearing</p>
      <h1>${escapeHtml(hearing.title)}<span>.</span></h1>
      <p>This page connects a published GovInfo Senate hearing record to extracted witnesses and official source documents.</p>
      <div class="event-actions">
        ${hearing.detailsUrl ? `<a class="button" href="${escapeHtml(hearing.detailsUrl)}" target="_blank" rel="noopener">GovInfo record</a>` : ""}
        ${hearing.pdfUrl ? `<a class="button secondary" href="${escapeHtml(hearing.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : ""}
        ${hearing.htmlUrl ? `<a class="button secondary" href="${escapeHtml(hearing.htmlUrl)}" target="_blank" rel="noopener">HTML</a>` : ""}
      </div>
    </section>

    <section class="event-facts" aria-label="Senate hearing information">
      <article><span>Date</span><strong>${escapeHtml(hearing.date || hearing.dateIssued || "Date pending")}</strong></article>
      <article><span>Committee</span><strong>${escapeHtml(hearing.committee?.name || "Senate committee")}</strong></article>
      <article><span>GovInfo package</span><strong>${escapeHtml(hearing.packageId || "GovInfo")}</strong></article>
      <article><span>Witnesses</span><strong>${witnesses.length}</strong></article>
    </section>

    <section class="event-layout">
      <article class="event-main-panel">
        <div class="directory-head">
          <div><p class="eyebrow">Source record</p><h2>Published hearing details</h2></div>
          <span>${escapeHtml(hearing.jacketId || hearing.granuleId || "")}</span>
        </div>
        <dl class="event-info-list">
          <div><dt>Title</dt><dd>${escapeHtml(hearing.title)}</dd></div>
          <div><dt>Committee</dt><dd>${escapeHtml(hearing.committee?.name || "Senate committee")}</dd></div>
          <div><dt>Hearing date</dt><dd>${escapeHtml(hearing.date || "Not extracted")}</dd></div>
          <div><dt>GovInfo date issued</dt><dd>${escapeHtml(hearing.dateIssued || "Not listed")}</dd></div>
          <div><dt>Package</dt><dd>${escapeHtml(hearing.packageId || "Not listed")}</dd></div>
        </dl>
        <div class="event-future-note">
          <p class="eyebrow">Extraction note</p>
          <p>Witnesses are parsed from the published GovInfo HTML table of contents. The official PDF and HTML remain the source of truth.</p>
        </div>
      </article>

      <aside class="event-side-panel">
        <p class="eyebrow">Record contents</p>
        <article><strong>${witnesses.length}</strong><span>${witnesses.length === 1 ? "Witness" : "Witnesses"}</span></article>
        <article><strong>2</strong><span>Official formats</span></article>
        <article><strong>${escapeHtml(hearing.congress || "119")}</strong><span>Congress</span></article>
      </aside>
    </section>

    <section class="event-section">
      <div class="directory-head"><div><p class="eyebrow">Witnesses</p><h2>People connected to this hearing</h2></div><span>${witnesses.length} listed</span></div>
      ${witnesses.length ? witnesses.map(renderSenateEventWitness).join("") : `<div class="empty-state">No witnesses were extracted from this published hearing.</div>`}
    </section>

    <section class="event-section">
      <div class="directory-head"><div><p class="eyebrow">Documents</p><h2>Official source materials</h2></div><span>GovInfo</span></div>
      <div class="event-doc-grid">
        ${hearing.pdfUrl ? `<a href="${escapeHtml(hearing.pdfUrl)}" target="_blank" rel="noopener"><span>PDF</span>${escapeHtml(hearing.title)}</a>` : ""}
        ${hearing.htmlUrl ? `<a href="${escapeHtml(hearing.htmlUrl)}" target="_blank" rel="noopener"><span>HTML</span>${escapeHtml(hearing.title)}</a>` : ""}
        ${hearing.detailsUrl ? `<a href="${escapeHtml(hearing.detailsUrl)}" target="_blank" rel="noopener"><span>GovInfo</span>Content details</a>` : ""}
      </div>
    </section>
  </main>
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function addWitnessesToHearings(hearings, profiles) {
  const byPackage = new Map(hearings.map((hearing) => [hearing.packageId, { ...hearing, witnesses: [] }]));
  for (const profile of profiles) {
    for (const appearance of profile.appearances || []) {
      const hearing = byPackage.get(appearance.packageId);
      if (!hearing) continue;
      hearing.witnesses.push({
        displayName: profile.displayName,
        role: appearance.role || profile.title,
        organization: appearance.organization || profile.organization,
        profileUrl: profile.profileUrl,
        initials: profile.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      });
    }
  }
  return [...byPackage.values()].map((hearing) => ({
    ...hearing,
    witnessCount: hearing.witnesses.length,
  }));
}

function writeSenateEventPages(hearings) {
  fs.rmSync(eventsDir, { recursive: true, force: true });
  fs.mkdirSync(eventsDir, { recursive: true });
  const manifest = {};
  for (const hearing of hearings) {
    const slug = eventSlug(hearing);
    hearing.localUrl = `senate-events/${slug}.html`;
    manifest[hearing.packageId || slug] = hearing.localUrl;
    fs.writeFileSync(path.join(eventsDir, `${slug}.html`), senateEventPage(hearing));
  }
  fs.writeFileSync(path.join(eventsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.rmSync(profilesDir, { recursive: true, force: true });
  fs.mkdirSync(profilesDir, { recursive: true });

  if (process.env.SENATE_WITNESS_PAGES_ONLY === "1") {
    const existing = JSON.parse(fs.readFileSync(path.join(assetsDir, "senate-witness-data.json"), "utf8"));
    const manifest = {};
    for (const profile of existing.profiles || []) {
      const slug = slugify(profile.key || profile.displayName);
      profile.profileUrl = `senate-witnesses/${slug}.html`;
      manifest[profile.key] = profile.profileUrl;
      fs.writeFileSync(path.join(profilesDir, `${slug}.html`), profilePage(profile));
    }
    writeSenateEventPages(existing.hearings || []);
    fs.writeFileSync(path.join(profilesDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Generated ${existing.profiles?.length || 0} Senate witness profile pages and ${existing.hearings?.length || 0} Senate event pages from existing data.`);
    return;
  }

  const hearingResults = [];
  for (const congress of congresses) {
    hearingResults.push(...await govInfoSearch(congress));
  }

  const hearings = [];
  const profiles = new Map();
  for (const result of hearingResults) {
    const htmlUrl = directContentUrl(result.download?.txtLink || "");
    if (!htmlUrl) continue;
    try {
      const html = await fetchText(htmlUrl);
      const text = extractPreText(html);
      const witnesses = extractWitnesses(text);
      const appearance = appearanceFromResult(result, text, witnesses);
      hearings.push(appearance);
      for (const witness of witnesses) mergeProfile(profiles, witness, appearance);
    } catch (error) {
      console.warn(`Skipping ${result.packageId}: ${error.message}`);
    }
  }

  const profileRows = [...profiles.values()].map((profile) => ({
    ...profile,
    appearances: profile.appearances.sort((a, b) => String(b.date || b.dateIssued).localeCompare(String(a.date || a.dateIssued))),
    sourceLines: [...new Set(profile.sourceLines)].slice(0, 8),
  })).sort((a, b) => b.appearanceCount - a.appearanceCount || a.displayName.localeCompare(b.displayName));

  const slugs = new Map();
  const seenSlugs = new Map();
  for (const profile of profileRows) {
    const base = slugify(profile.key || profile.displayName);
    const count = seenSlugs.get(base) || 0;
    seenSlugs.set(base, count + 1);
    const slug = count ? `${base}-${count + 1}` : base;
    slugs.set(profile.key, slug);
    profile.profileUrl = `senate-witnesses/${slug}.html`;
  }

  const hearingsWithWitnesses = addWitnessesToHearings(hearings, profileRows);
  writeSenateEventPages(hearingsWithWitnesses);
  for (const profile of profileRows) {
    fs.writeFileSync(path.join(profilesDir, `${slugs.get(profile.key)}.html`), profilePage(profile));
  }

  const committees = makeCommittees(hearingsWithWitnesses);
  const data = {
    generatedAt: new Date().toISOString(),
    source: {
      name: "GovInfo Congressional Hearings",
      url: "https://www.govinfo.gov/help/chrg",
      searchApi: "https://api.govinfo.gov/search",
      congresses,
      apiKeyMode: govInfoApiKey === "DEMO_KEY" ? "DEMO_KEY" : "GOVINFO_API_KEY",
    },
    caveats: [
      "Witnesses are extracted from the table-of-contents text in published Senate hearing HTML on GovInfo.",
      "GovInfo says most congressional hearings are published two months to two years after they are held, and not all hearings are available.",
      "LinkedIn, Google Scholar, official bio, and photo links are provided as research links unless verified links are later attached.",
    ],
    totals: {
      hearings: hearings.length,
      witnesses: profileRows.length,
      appearances: profileRows.reduce((sum, profile) => sum + profile.appearanceCount, 0),
      committees: committees.length,
      researchNeeded: profileRows.filter((profile) => profile.enrichmentStatus === "research-needed").length,
    },
    committees,
    hearings: hearingsWithWitnesses.sort((a, b) => String(b.date || b.dateIssued).localeCompare(String(a.date || a.dateIssued))),
    profiles: profileRows,
  };

  fs.writeFileSync(path.join(assetsDir, "senate-witness-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(path.join(assetsDir, "senate-witness-data.js"), `window.SENATE_WITNESS_DATA = ${JSON.stringify(data)};\n`);
  fs.writeFileSync(path.join(profilesDir, "manifest.json"), `${JSON.stringify(Object.fromEntries([...slugs.entries()].map(([key, slug]) => [key, `senate-witnesses/${slug}.html`])), null, 2)}\n`);
  console.log(`Wrote ${profileRows.length} Senate witness profiles from ${hearings.length} published hearings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
