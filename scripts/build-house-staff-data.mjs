import fs from "node:fs";
import path from "node:path";
import { disbursementCsvFiles, periodFromFilename, periodRank } from "./house-disbursement-utils.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "house-expenditure-explorer-2026-05-01");
const rawDir = path.join(sourceRoot, "data", "raw");
const outJson = path.join(root, "assets", "house-staff-data.json");
const outJs = path.join(root, "assets", "house-staff-data.js");
const outDir = path.join(root, "staffers");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function stripOrgYear(org) {
  return String(org || "")
    .replace(/^FISCAL YEAR\s+20\d{2}\s+/i, "")
    .replace(/^20\d{2}\s+/, "")
    .trim();
}

function classifyOffice(organization) {
  const org = String(organization || "").toUpperCase();
  const stripped = stripOrgYear(organization).toUpperCase();
  if (/^HON\./.test(stripped)) return "Member office";
  if (/OFFICE OF THE SPEAKER|MAJORITY LEADER|MINORITY LEADER|MAJORITY WHIP|MINORITY WHIP|DEMOCRATIC CAUCUS|REPUBLICAN CONFERENCE|REPUBLICAN STUDY COMMITTEE|HOUSE DEMOCRATIC POLICY|HOUSE REPUBLICAN POLICY/.test(org)) return "Leadership";
  if (/COMMITTEE|COMMMITTEE|ARMED SERVICES|HOUSE ADMINISTRATION|TRANSPORTATION-INFRASTRUCTURE|PERMANENT SELECT|SELECT COMMITTEE|WAYS AND MEANS|APPROPRIATIONS|HOMELAND SECURITY|INTELLIGENCE|COMM ON SCIENCE|SCIENCE SPACE&TECH/.test(org)) return "Committee";
  if (/CHIEF ADMIN|CLERK OF THE HOUSE|SERGEANT AT ARMS|GENERAL COUNSEL|LEGISLATIVE COUNSEL|PARLIAMENTARIAN|LAW REVISION|INSPECTOR GENERAL|GOVERNMENT CONTRIBUTIONS|EMPLOYEE ADVOCACY|WHISTLEBLOWER|OFFICE CONGRESSIONAL CONDUCT|OFFICE OF CONGRESSIONAL ETHICS|OFFICE OF DIVERSITY|INTERPARLIAMENTARY|HOUSE OF REPRESENTATIVES|FINE ARTS|ATTENDING PHYSICIAN|MAIL|PRINTING|RECORDING STUDIO|CYBERSECURITY|WEB SOLUTIONS|ENTERPRISE|TECHNOLOGY|ACQUISITIONS|FINANCE|PAYROLL|HUMAN RESOURCES|LOGISTICS|CUSTOMER EXPERIENCE|CONGRESSIONAL STAFF ACADEMY|CAPITOL SERVICE CENTER|FURNISHINGS|OFFICE SUPPLY|TELECOMMUNICATIONS|NET EXPENSES TELECOMMUNICATION|NET EXP OF EQUIP|STATIONERY|COMMUNICATIONS EQUIPMENT|COMMUNICATIONS|CDN ENHANCE|LIFE CYCLE REPLACEMENT|SERVICE MANAGEMENT|COORDINATING SERVICES|TECHNICAL ASSISTANTS|CAMPUS VOICE NETWORK|LGTCS & SUPP|CHILD CARE CENTER|EMPLOYEE ASSISTANCE|SALARIES  OFFICERS/.test(org)) return "Institutional";
  return "Other House office";
}

function staffGroup(title, officeType) {
  const text = String(title || "").toUpperCase();
  if (/INTERN/.test(text)) return "Intern";
  if (/SHARED EMPLOYEE|FINANCIAL ADMINISTRATOR|FINANCE ADMINISTRATOR/.test(text)) return "Shared staff";
  if (officeType === "Committee") return "Committee staff";
  if (officeType === "Member office") return "Member office staff";
  return officeType;
}

function normalizeTitle(title) {
  return String(title || "Title not listed")
    .replace(/\s*\((?:OTHER\s+)?COMPENSATION\)\s*/gi, " ")
    .replace(/\s*\(OVERTIME\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || "Title not listed";
}

function slugify(value) {
  return String(value || "staffer")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "staffer";
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

function addCount(map, key) {
  const clean = key || "Not listed";
  map.set(clean, (map.get(clean) || 0) + 1);
}

function topEntries(map, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
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
      if (/^(jr|sr)\.?$/.test(token)) return token.replace(/^[a-z]+/i, (part) => part.toUpperCase());
      return token
        .split(/([-'])/)
        .map((part) => (/[-']/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
    })
    .join(" ");
}

function personKey(name) {
  return String(name || "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
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
      <div class="nav-actions"><a class="button secondary" href="../staff.html">Staff Explorer</a><a class="button" href="mailto:info@popvox.com">Request a demo</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function renderProfile(profile) {
  const titleDot = /[.!?]$/.test(profile.name.trim()) ? "" : "<span>.</span>";
  const statusLabel = profile.isActive ? "Active" : "Inactive";
  const body = `<main class="staff-profile-shell">
    <section class="witness-profile-hero staff-profile-hero">
      <a class="back-link" href="../staff.html">← Staff Explorer</a>
      <div class="witness-profile-hero-grid">
        <div class="witness-profile-identity">
          <div class="witness-profile-avatar">${escapeHtml(initials(profile.name))}</div>
          <div>
            <p class="eyebrow">House Staff Profile</p>
            <h1>${escapeHtml(profile.name)}${titleDot}</h1>
            <p>${escapeHtml(profile.currentTitle || "Title from disbursement record")}</p>
            <strong>${escapeHtml(profile.currentOffice || "Office pending")}</strong>
          </div>
        </div>
        <div class="witness-profile-badges">
          <span class="${profile.isActive ? "active-status" : "inactive-status"}">${statusLabel}</span>
          <span>${escapeHtml(profile.staffType)}</span>
          <span>${profile.roles.length} role record${profile.roles.length === 1 ? "" : "s"}</span>
          <span>${escapeHtml(profile.latestPeriod)}</span>
        </div>
      </div>
    </section>

    <section class="witness-profile-overview">
      <article>
        <p class="eyebrow">Public source</p>
        <h2>Disbursement-derived profile</h2>
        <p>This profile is inferred from House Statement of Disbursements personnel-compensation rows. Staff are marked active only when they appear in the latest loaded disbursement report. Compensation values are intentionally not displayed here.</p>
      </article>
      <aside>
        <dl class="bill-meta-list">
          <div><dt>Status</dt><dd>${statusLabel}</dd></div>
          <div><dt>${profile.isActive ? "Current office" : "Most recent office"}</dt><dd>${escapeHtml(profile.currentOffice || "Not listed")}</dd></div>
          <div><dt>${profile.isActive ? "Current title" : "Most recent title"}</dt><dd>${escapeHtml(profile.currentTitle || "Not listed")}</dd></div>
          <div><dt>Periods seen</dt><dd>${escapeHtml(profile.periods.join(", "))}</dd></div>
        </dl>
      </aside>
    </section>

    <section class="witness-profile-section">
      <div class="directory-head"><div><p class="eyebrow">Roles</p><h2>Office and title history</h2></div><span>${profile.roles.length}</span></div>
      <div class="staff-role-list">
        ${profile.roles.map((role) => `<article>
          <span>${escapeHtml(role.periods.join(", "))}</span>
          <h3>${escapeHtml(role.title)}</h3>
          <p>${escapeHtml(role.office)}</p>
          <small>${escapeHtml(role.officeType)} · ${role.rowCount} row${role.rowCount === 1 ? "" : "s"}</small>
        </article>`).join("")}
      </div>
    </section>
  </main>`;

  return pageShell({
    title: profile.name,
    description: `${profile.name} House staff profile inferred from public House disbursement staff records.`,
    body,
  });
}

if (!fs.existsSync(rawDir)) {
  throw new Error(`Missing raw expenditure CSV directory: ${rawDir}`);
}

const files = disbursementCsvFiles(rawDir);
const sourcePeriods = [...new Set(files.map(periodFromFilename))].sort((a, b) => periodRank(a) - periodRank(b));
const latestDisbursementPeriod = sourcePeriods.at(-1) || "";

const people = new Map();
const offices = new Map();
const titles = new Map();
let rowCount = 0;
let internRows = 0;

for (const fileName of files) {
  const period = periodFromFilename(fileName);
  const rows = parseCsv(fs.readFileSync(path.join(rawDir, fileName), "utf8"));
  const headers = rows.shift().map((header) => String(header || "").trim());
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));

  for (const raw of rows.filter((row) => row.length > 1)) {
    if ((raw[index["SORT SEQUENCE"]] || "") !== "DETAIL") continue;
    if (String(raw[index["BUDGET OBJECT CLASS"]] || "").trim() !== "11") continue;

    const name = String(raw[index["VENDOR NAME"]] || "").trim();
    if (!name || name === "No vendor listed") continue;

    const office = stripOrgYear(raw[index.ORGANIZATION] || "");
    const title = normalizeTitle(raw[index.DESCRIPTION] || "");
    const officeType = classifyOffice(office);
    const group = staffGroup(title, officeType);
    const key = personKey(name);
    const person = people.get(key) || {
      name: titleCaseName(name),
      offices: new Map(),
      titles: new Map(),
      periods: new Set(),
      groups: new Map(),
      roleMap: new Map(),
      latestPeriod: period,
    };

    rowCount += 1;
    if (group === "Intern") internRows += 1;
    addCount(person.offices, office);
    addCount(person.titles, title);
    addCount(person.groups, group);
    person.periods.add(period);
    if (periodRank(period) >= periodRank(person.latestPeriod)) person.latestPeriod = period;

    const roleKey = `${office}::${title}`;
    const role = person.roleMap.get(roleKey) || {
      office,
      title,
      officeType,
      periods: new Set(),
      rowCount: 0,
      latestPeriod: period,
    };
    role.periods.add(period);
    role.rowCount += 1;
    if (periodRank(period) >= periodRank(role.latestPeriod)) role.latestPeriod = period;
    person.roleMap.set(roleKey, role);

    addCount(offices, office);
    addCount(titles, title);
    people.set(key, person);
  }
}

const slugCounts = new Map();
const profiles = [...people.values()].map((person) => {
  const latestRoles = [...person.roleMap.values()]
    .filter((role) => role.latestPeriod === person.latestPeriod)
    .sort((a, b) => b.rowCount - a.rowCount || a.office.localeCompare(b.office));
  const primaryRole = latestRoles[0] || [...person.roleMap.values()][0];
  const baseSlug = slugify(person.name);
  const count = slugCounts.get(baseSlug) || 0;
  slugCounts.set(baseSlug, count + 1);
  const slug = count ? `${baseSlug}-${count + 1}` : baseSlug;
  const roles = [...person.roleMap.values()]
    .sort((a, b) => periodRank(b.latestPeriod) - periodRank(a.latestPeriod) || b.rowCount - a.rowCount || a.office.localeCompare(b.office))
    .map((role) => ({
      office: role.office,
      title: role.title,
      officeType: role.officeType,
      periods: [...role.periods].sort((a, b) => periodRank(a) - periodRank(b)),
      rowCount: role.rowCount,
      latestPeriod: role.latestPeriod,
    }));
  const isActive = person.latestPeriod === latestDisbursementPeriod;

  return {
    slug,
    name: person.name,
    isActive,
    status: isActive ? "Active" : "Inactive",
    currentOffice: primaryRole?.office || topEntries(person.offices, 1)[0]?.label || "",
    currentTitle: primaryRole?.title || topEntries(person.titles, 1)[0]?.label || "",
    staffType: topEntries(person.groups, 1)[0]?.label || "House staff",
    latestPeriod: person.latestPeriod,
    periods: [...person.periods].sort((a, b) => periodRank(a) - periodRank(b)),
    officeCount: person.offices.size,
    titleCount: person.titles.size,
    roleCount: roles.length,
    roles,
    topOffices: topEntries(person.offices, 6),
    topTitles: topEntries(person.titles, 6),
  };
}).sort((a, b) => a.name.localeCompare(b.name));
const staffTypeCounts = new Map();
for (const profile of profiles) addCount(staffTypeCounts, profile.staffType);
const statusCounts = new Map();
for (const profile of profiles) addCount(statusCounts, profile.status);

const data = {
  generatedAt: new Date().toISOString(),
  source: {
    statement: `House Statement of Disbursements personnel-compensation rows: ${files.map(periodFromFilename).join(", ")}`,
    latestDisbursementPeriod,
    rowCount,
  },
  totals: {
    staffers: profiles.length,
    activeStaffers: profiles.filter((profile) => profile.isActive).length,
    inactiveStaffers: profiles.filter((profile) => !profile.isActive).length,
    payrollRows: rowCount,
    offices: offices.size,
    titles: titles.size,
    internRows,
  },
  filters: {
    statuses: topEntries(statusCounts, 4),
    staffTypes: topEntries(staffTypeCounts, 20),
    offices: topEntries(offices, 80),
    titles: topEntries(titles, 80),
    periods: ["Jan-Mar 2025", "Apr-Jun 2025", "Jul-Sep 2025", "Oct-Dec 2025"],
  },
  profiles: profiles.map((profile) => ({
    slug: profile.slug,
    name: profile.name,
    isActive: profile.isActive,
    status: profile.status,
    currentOffice: profile.currentOffice,
    currentTitle: profile.currentTitle,
    staffType: profile.staffType,
    latestPeriod: profile.latestPeriod,
    periods: profile.periods,
    officeCount: profile.officeCount,
    titleCount: profile.titleCount,
    roleCount: profile.roleCount,
    topOffices: profile.topOffices,
    topTitles: profile.topTitles,
  })),
};

fs.writeFileSync(outJson, `${JSON.stringify(data)}\n`);
fs.writeFileSync(outJs, `window.HOUSE_STAFF_DATA = ${JSON.stringify(data)};\n`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = {};
for (const profile of profiles) {
  manifest[profile.name] = `staffers/${profile.slug}.html`;
  fs.writeFileSync(path.join(outDir, `${profile.slug}.html`), renderProfile(profile));
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Generated ${profiles.length.toLocaleString()} staff profiles from ${rowCount.toLocaleString()} personnel rows.`);
