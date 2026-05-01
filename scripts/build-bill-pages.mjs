import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const billsDir = path.join(root, "bills");
const journalPath = path.join(root, "assets", "house-journal-ledger.json");
const localLegislationUrl = process.env.POPVOX_LEGISLATION_API || "http://127.0.0.1:8771/api/legislation";
const billPattern = /\bH\.?\s*(?:Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*\d+\b/gi;
let knownBillLabels = new Set();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function normalizeBillRef(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const match = text.match(/^H\.?\s*(Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*(\d+)$/i);
  if (!match) return "";
  const kind = match[1].replace(/\s+/g, " ").toLowerCase();
  const label = ({
    r: "H.R.",
    res: "H.Res.",
    "j. res": "H.J.Res.",
    jres: "H.J.Res.",
    "con. res": "H.Con.Res.",
    conres: "H.Con.Res.",
  })[kind] || `H.${match[1]}.`;
  return `${label} ${match[2]}`;
}

function billSlug(label) {
  return normalizeBillRef(label).toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "-");
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.documents)) return payload.documents;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function billFromApiRow(row) {
  const number = normalizeBillRef(String(row.document_number || row.bill_number || row.number || "").replace(/-/g, " "));
  if (!number) return null;
  const title = row.title || number;
  return {
    id: row.id || "",
    label: number,
    title,
    shortTitle: title.replace(new RegExp(`^${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—-]\\s*`, "i"), ""),
    status: row.status || "",
    date: row.document_date || row.introduced_date || row.created_at || "",
    introducedDate: row.document_date || row.introduced_date || row.created_at || "",
    sponsor: "",
    sponsorBioguideId: "",
    cosponsorCount: "",
    cosponsors: [],
    committees: [],
    summary: row.description || "",
    sourceUrl: row.file_download_url || row.url || "",
    apiRecord: row,
  };
}

function linkDepth(filePath) {
  const rel = path.relative(root, filePath);
  const depth = rel.split(path.sep).length - 1;
  return depth ? "../".repeat(depth) : "";
}

function contextSnippet(text, bill) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const index = clean.toLowerCase().indexOf(bill.toLowerCase());
  if (index < 0) return clean.slice(0, 240);
  const start = Math.max(0, index - 110);
  const end = Math.min(clean.length, index + bill.length + 180);
  return `${start ? "..." : ""}${clean.slice(start, end)}${end < clean.length ? "..." : ""}`;
}

async function loadApiBills() {
  try {
    const response = await fetch(localLegislationUrl);
    if (!response.ok) return [];
    return asArray(await response.json()).map(billFromApiRow).filter(Boolean);
  } catch {
    return [];
  }
}

function collectJournalBills(map) {
  if (!fs.existsSync(journalPath)) return;
  const data = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  for (const action of data.actions || []) {
    for (const field of [action.bill, action.title, action.text]) {
      for (const match of String(field || "").matchAll(billPattern)) {
        const label = normalizeBillRef(match[0]);
        if (!label) continue;
        const bill = ensureBill(map, label);
        bill.contexts.push({
          source: "House Journal Explorer",
          date: action.date || "",
          type: action.actionType || action.type || "",
          text: contextSnippet(action.text || action.title, label),
          url: `../journal.html`,
        });
      }
    }
  }
}

function collectHtmlBills(map) {
  const files = publicHtmlFiles().filter((file) => !path.relative(root, file).startsWith(`bills${path.sep}`));
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8").replace(/<[^>]+>/g, " ");
    for (const match of html.matchAll(billPattern)) {
      const label = normalizeBillRef(match[0]);
      if (!label) continue;
      const bill = ensureBill(map, label);
      if (bill.contexts.length < 20) {
        bill.contexts.push({
          source: path.relative(root, file),
          text: contextSnippet(html, label),
          url: `${linkDepth(path.join(billsDir, `${billSlug(label)}.html`))}${path.relative(root, file).replaceAll(path.sep, "/")}`,
        });
      }
    }
  }
}

function publicHtmlFiles() {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (rel.startsWith("Committee Corpus + Witness Directory - CTO Share")) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

function ensureBill(map, label) {
  const normalized = normalizeBillRef(label);
  if (!map.has(normalized)) {
    map.set(normalized, {
      label: normalized,
      slug: billSlug(normalized),
      title: normalized,
      status: "",
      date: "",
      introducedDate: "",
      sponsor: "",
      sponsorBioguideId: "",
      cosponsorCount: "",
      cosponsors: [],
      committees: [],
      summary: "",
      sourceUrl: "",
      contexts: [],
      apiRecord: null,
    });
  }
  return map.get(normalized);
}

function mergeApiBill(map, apiBill) {
  const bill = ensureBill(map, apiBill.label);
  bill.title = apiBill.title || bill.title;
  bill.shortTitle = apiBill.shortTitle || bill.shortTitle;
  bill.status = apiBill.status || bill.status;
  bill.date = apiBill.date || bill.date;
  bill.introducedDate = apiBill.introducedDate || bill.introducedDate;
  bill.summary = apiBill.summary || bill.summary;
  bill.sourceUrl = apiBill.sourceUrl || bill.sourceUrl;
  bill.id = apiBill.id || bill.id;
  bill.apiRecord = apiBill.apiRecord;
}

function congressGovUrl(bill) {
  const match = bill.label.match(/^H\.(R|Res|J\.Res|Con\.Res)\. (\d+)$/);
  if (!match) return "";
  const type = ({
    R: "house-bill",
    Res: "house-resolution",
    "J.Res": "house-joint-resolution",
    "Con.Res": "house-concurrent-resolution",
  })[match[1]];
  return `https://www.congress.gov/bill/119th-congress/${type}/${match[2]}`;
}

function billPageHrefFromContext(label) {
  const normalized = normalizeBillRef(label);
  if (!knownBillLabels.has(normalized)) return "";
  if (!normalized) return "";
  return `../bills/${billSlug(normalized)}.html`;
}

function linkBillRefs(value) {
  return escapeHtml(value).replace(billPattern, (match) => {
    const href = billPageHrefFromContext(match);
    return href ? `<a class="bill-ref" href="${escapeHtml(href)}">${escapeHtml(match)}</a>` : escapeHtml(match);
  });
}

function docTypeLabel(context) {
  const text = `${context.source || ""} ${context.type || ""}`.toLowerCase();
  if (text.includes("committee") || text.includes("events/")) return "Committee activity";
  if (text.includes("journal")) return "House Journal";
  if (text.includes("vote")) return "Vote";
  if (text.includes("cbo")) return "CBO score";
  return "Related record";
}

function connectedBuckets(contexts) {
  const buckets = new Map();
  for (const context of contexts) {
    const key = docTypeLabel(context);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(context);
  }
  return [...buckets.entries()];
}

function billJson(bill, contexts) {
  return JSON.stringify({
    id: bill.id || "",
    label: bill.label,
    title: bill.title,
    shortTitle: bill.shortTitle || bill.title,
    status: bill.status || "",
    introducedDate: bill.introducedDate || bill.date || "",
    sponsor: bill.sponsor || "",
    sponsorBioguideId: bill.sponsorBioguideId || "",
    cosponsorCount: bill.cosponsorCount || "",
    cosponsors: bill.cosponsors || [],
    committees: bill.committees || [],
    summary: bill.summary || "",
    textUrl: bill.sourceUrl || congressGovUrl(bill),
    congressGovUrl: congressGovUrl(bill),
    contexts: contexts.map((context) => ({
      source: context.source || "",
      date: context.date || "",
      type: context.type || "",
      text: context.text || "",
      url: context.url || "",
      bucket: docTypeLabel(context),
    })),
  }).replace(/<\/script/gi, "<\\/script");
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
      <div class="nav-actions"><a class="button secondary" href="../legislation.html">Legislation Explorer</a><a class="button" href="mailto:info@popvox.com">Create alert</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
  <script src="../bill-detail.js"></script>
</body>
</html>`;
}

function renderBillPage(bill) {
  const contexts = bill.contexts
    .filter((context, index, arr) => arr.findIndex((item) => item.source === context.source && item.text === context.text) === index)
    .slice(0, 18);
  const buckets = connectedBuckets(contexts);
  const textUrl = bill.sourceUrl || congressGovUrl(bill);
  const body = `<main class="bill-detail-shell">
    <script type="application/json" id="bill-data">${billJson(bill, contexts)}</script>
    <section class="event-hero bill-detail-hero">
      <a class="back-link" href="../legislation.html">← Legislation Explorer</a>
      <p class="eyebrow">Bill Page</p>
      <h1>${escapeHtml(bill.label)}<span>.</span></h1>
      <p>${escapeHtml(bill.title === bill.label ? "A generated bill page built from CongressLink data and mentions across POPVOX Explorers. Richer details attach here as the bill API expands." : bill.title)}</p>
      <div class="event-actions">
        <a class="button" href="${escapeHtml(textUrl || "../legislation.html")}" ${textUrl ? 'target="_blank" rel="noopener"' : ""}>Bill text</a>
        <a class="button secondary" href="../journal.html">House Journal Explorer</a>
      </div>
    </section>

    <section class="event-facts" aria-label="Bill information">
      <article><span>Measure</span><strong>${escapeHtml(bill.label)}</strong></article>
      <article><span>Status</span><strong>${escapeHtml(bill.status || "Mentioned in source data")}</strong></article>
      <article><span>Introduced</span><strong id="bill-introduced">${escapeHtml(bill.introducedDate || bill.date || "Date pending")}</strong></article>
      <article><span>Mentions</span><strong>${contexts.length.toLocaleString()}</strong></article>
    </section>

    <section class="bill-detail-grid">
      <article class="bill-detail-panel bill-summary-panel">
        <p class="eyebrow">Summary</p>
        <h2>What this bill would do</h2>
        <p id="bill-summary">${escapeHtml(bill.summary || bill.shortTitle || "A plain-language summary can be generated once full bill text or official summary data is available.")}</p>
      </article>

      <article class="bill-detail-panel">
        <p class="eyebrow">People</p>
        <dl class="bill-meta-list">
          <div><dt>Sponsor</dt><dd id="bill-sponsor">${escapeHtml(bill.sponsor || "Loading sponsor from CongressLink...")}</dd></div>
          <div><dt>Cosponsors</dt><dd id="bill-cosponsors">${escapeHtml(String(bill.cosponsorCount || "Loading..."))}</dd></div>
        </dl>
      </article>

      <article class="bill-detail-panel">
        <p class="eyebrow">Referral</p>
        <dl class="bill-meta-list">
          <div><dt>Committee(s)</dt><dd id="bill-committees">${bill.committees?.length ? escapeHtml(bill.committees.join(" · ")) : "Referral metadata pending"}</dd></div>
          <div><dt>Text</dt><dd>${textUrl ? `<a href="${escapeHtml(textUrl)}" target="_blank" rel="noopener">Open bill text</a>` : "Text link pending"}</dd></div>
        </dl>
      </article>
    </section>

    <section class="bill-chat-section">
      <article class="bill-chat-panel">
        <div class="rules-chat-head">
          <div>
            <p class="eyebrow">Ask This Bill</p>
            <h2>Question the record</h2>
          </div>
          <span class="rules-status"><span></span> Preview</span>
        </div>
        <div class="rules-suggestions" aria-label="Suggested bill questions">
          <button type="button" data-bill-question="What does this bill do?">What does this bill do?</button>
          <button type="button" data-bill-question="Who sponsored it?">Who sponsored it?</button>
          <button type="button" data-bill-question="Where else does it appear?">Where else does it appear?</button>
          <button type="button" data-bill-question="What committees or actions are connected?">What committees or actions are connected?</button>
        </div>
        <div class="rules-messages bill-chat-messages" id="bill-chat-messages" aria-live="polite"></div>
        <form class="rules-input-form" id="bill-chat-form">
          <label class="sr-only" for="bill-chat-input">Ask about this bill</label>
          <textarea id="bill-chat-input" rows="2" placeholder="Ask about sponsor, status, text, hearings, votes, journal mentions, or related records..."></textarea>
          <button class="button" type="submit">Ask</button>
        </form>
      </article>
    </section>

    <section class="event-section bill-context-section">
      <div class="directory-head"><div><p class="eyebrow">Connected Records</p><h2>Related things</h2></div><span>${contexts.length} shown</span></div>
      <div class="bill-related-summary">
        ${buckets.length ? buckets.map(([label, rows]) => `<span>${escapeHtml(label)} · ${rows.length}</span>`).join("") : "<span>Committee markups, CBO scores, votes, and Journal mentions will appear here as records connect.</span>"}
      </div>
      ${contexts.length ? contexts.map((context) => `
        <article class="bill-context-card">
          <div>
            <span>${escapeHtml(docTypeLabel(context))}${context.date || context.type ? ` · ${escapeHtml([context.date, context.type].filter(Boolean).join(" · "))}` : ""}</span>
            <h3>${escapeHtml(context.source)}</h3>
            <p>${linkBillRefs(context.text)}</p>
          </div>
          ${context.url ? `<a class="link-button" href="${escapeHtml(context.url)}">Open source</a>` : ""}
        </article>
      `.trim()).join("\n") : `<div class="empty-state">This bill page was created from a citation, but no source context was captured yet.</div>`}
    </section>
  </main>`;
  return pageShell({
    title: bill.label,
    description: `${bill.label} bill page with title, status, sponsor, cosponsor, text, and linked source mentions across POPVOX Explorers.`,
    body,
  });
}

function linkBillsInHtml(file, knownBills) {
  let html = fs.readFileSync(file, "utf8");
  const prefix = linkDepth(file);
  let inAnchor = false;
  let inScript = false;
  let inStyle = false;
  let inTitle = false;
  const parts = html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) {
      const lower = part.toLowerCase();
      if (/^<a\b/.test(lower)) inAnchor = true;
      if (/^<\/a\b/.test(lower)) inAnchor = false;
      if (/^<script\b/.test(lower)) inScript = true;
      if (/^<\/script\b/.test(lower)) inScript = false;
      if (/^<style\b/.test(lower)) inStyle = true;
      if (/^<\/style\b/.test(lower)) inStyle = false;
      if (/^<title\b/.test(lower)) inTitle = true;
      if (/^<\/title\b/.test(lower)) inTitle = false;
      return part;
    }
    if (inAnchor || inScript || inStyle || inTitle) return part;
    return part.replace(billPattern, (match) => {
      const label = normalizeBillRef(match);
      const slug = billSlug(label);
      if (!knownBills.has(label)) return match;
      return `<a class="bill-ref" href="${prefix}bills/${slug}.html">${escapeHtml(match)}</a>`;
    });
  });
  fs.writeFileSync(file, parts.join(""));
}

fs.mkdirSync(billsDir, { recursive: true });

const bills = new Map();
collectJournalBills(bills);
collectHtmlBills(bills);
for (const apiBill of await loadApiBills()) mergeApiBill(bills, apiBill);
knownBillLabels = new Set(bills.keys());

for (const bill of bills.values()) {
  fs.writeFileSync(path.join(billsDir, `${bill.slug}.html`), renderBillPage(bill));
}

const knownBills = new Set(bills.keys());
for (const file of publicHtmlFiles().filter((file) => !path.relative(root, file).startsWith(`bills${path.sep}`))) {
  linkBillsInHtml(file, knownBills);
}

console.log(`Generated ${bills.size} bill pages and linked bill references across public HTML.`);
