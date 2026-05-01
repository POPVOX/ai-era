import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultOutDir = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "witness-directory", "data", "lda-normalized");
const outDir = path.resolve(process.env.LDA_OUTPUT_DIR || defaultOutDir);
const apiBase = (process.env.LDA_API_BASE || "https://lda.gov/api/v1").replace(/\/+$/, "");
const token = process.env.LDA_API_KEY || process.env.LDA_TOKEN || "";
const pageSize = Number(process.env.LDA_PAGE_SIZE || 100);
const requestDelayMs = Number(process.env.LDA_REQUEST_DELAY_MS || 0);
const maxPages = Number(process.env.LDA_MAX_PAGES || 0);
const currentYear = new Date().getFullYear();
const years = parseYears(process.argv, process.env.LDA_FILING_YEARS || String(currentYear));

function parseYears(argv, fallback) {
  const fromArg = argv.find((arg) => arg.startsWith("--years="))?.split("=")[1]
    || argv.find((arg) => arg.startsWith("--year="))?.split("=")[1];
  return String(fromArg || fallback)
    .split(",")
    .map((year) => Number(year.trim()))
    .filter((year) => Number.isInteger(year) && year > 1990)
    .sort((a, b) => b - a);
}

function titleCaseName(parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function jsonlLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response, text) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const seconds = text.match(/available in (\d+) seconds/i)?.[1];
  return seconds ? Number(seconds) * 1000 : 60_000;
}

function filingPeriodRank(item) {
  const ranks = {
    fourth_quarter: 4,
    third_quarter: 3,
    second_quarter: 2,
    first_quarter: 1,
    year_end: 5,
    mid_year: 2,
  };
  return (Number(item.filing_year) || 0) * 10 + (ranks[item.filing_period] || 0);
}

async function fetchJson(url, attempt = 0) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Token ${token}`;
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (response.status === 429 && attempt < 6) {
    const delay = retryDelayMs(response, text);
    console.log(`\nLDA API throttled. Waiting ${Math.ceil(delay / 1000)} seconds before retrying...`);
    await sleep(delay);
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`LDA API ${response.status} for ${url}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function fetchFilingsForYear(year) {
  let url = `${apiBase}/filings/?filing_year=${encodeURIComponent(year)}&page=1&page_size=${encodeURIComponent(pageSize)}`;
  const filings = [];
  let pages = 0;
  while (url) {
    const page = await fetchJson(url);
    pages += 1;
    filings.push(...(page.results || []));
    url = maxPages && pages >= maxPages ? "" : page.next;
    process.stdout.write(`\rFetched ${filings.length.toLocaleString()} LDA filings for ${year}`);
    if (requestDelayMs) await sleep(requestDelayMs);
  }
  process.stdout.write("\n");
  return filings;
}

function normalizeFiling(row) {
  return cleanObject({
    filing_uuid: row.filing_uuid,
    filing_type: row.filing_type,
    filing_type_display: row.filing_type_display,
    filing_year: row.filing_year,
    filing_period: row.filing_period,
    filing_period_display: row.filing_period_display,
    filing_document_url: row.filing_document_url,
    filing_document_content_type: row.filing_document_content_type,
    income: row.income,
    expenses: row.expenses,
    expenses_method: row.expenses_method,
    expenses_method_display: row.expenses_method_display,
    posted_by_name: row.posted_by_name,
    dt_posted: row.dt_posted,
    termination_date: row.termination_date,
    registrant_id: row.registrant?.id,
    registrant_name: row.registrant?.name,
    client_id: row.client?.id || row.client?.client_id,
    client_name: row.client?.name,
    source_api_url: row.url,
  });
}

function normalizeRegistrant(registrant) {
  if (!registrant?.id) return null;
  return cleanObject({
    registrant_id: registrant.id,
    house_registrant_id: registrant.house_registrant_id,
    name: registrant.name,
    description: registrant.description,
    address_1: registrant.address_1,
    address_2: registrant.address_2,
    city: registrant.city,
    state: registrant.state,
    state_display: registrant.state_display,
    zip: registrant.zip,
    country: registrant.country,
    country_display: registrant.country_display,
    ppb_country: registrant.ppb_country,
    ppb_country_display: registrant.ppb_country_display,
    contact_name: registrant.contact_name,
    contact_telephone: registrant.contact_telephone,
    dt_updated: registrant.dt_updated,
    source_api_url: registrant.url,
  });
}

function normalizeClient(client) {
  if (!client?.id && !client?.client_id) return null;
  return cleanObject({
    client_id: client.id || client.client_id,
    name: client.name,
    general_description: client.general_description,
    client_government_entity: client.client_government_entity,
    client_self_select: client.client_self_select,
    state: client.state,
    state_display: client.state_display,
    country: client.country,
    country_display: client.country_display,
    ppb_state: client.ppb_state,
    ppb_state_display: client.ppb_state_display,
    ppb_country: client.ppb_country,
    ppb_country_display: client.ppb_country_display,
    effective_date: client.effective_date,
    source_api_url: client.url,
  });
}

function normalizeLobbyist(lobbyist) {
  if (!lobbyist?.id) return null;
  const name = titleCaseName([lobbyist.prefix_display || lobbyist.prefix, lobbyist.first_name, lobbyist.middle_name, lobbyist.last_name, lobbyist.suffix_display || lobbyist.suffix]);
  return cleanObject({
    lobbyist_id: lobbyist.id,
    name,
    prefix: lobbyist.prefix_display || lobbyist.prefix,
    first_name: lobbyist.first_name,
    nickname: lobbyist.nickname,
    middle_name: lobbyist.middle_name,
    last_name: lobbyist.last_name,
    suffix: lobbyist.suffix_display || lobbyist.suffix,
  });
}

function normalizeLobbyistLink({ filing, activity, lobbyistEntry, activityIndex }) {
  const lobbyist = lobbyistEntry.lobbyist;
  return cleanObject({
    filing_uuid: filing.filing_uuid,
    filing_year: filing.filing_year,
    filing_period: filing.filing_period,
    registrant_id: filing.registrant?.id,
    registrant_name: filing.registrant?.name,
    client_id: filing.client?.id || filing.client?.client_id,
    client_name: filing.client?.name,
    lobbyist_id: lobbyist?.id,
    lobbyist_name: titleCaseName([lobbyist?.prefix_display || lobbyist?.prefix, lobbyist?.first_name, lobbyist?.middle_name, lobbyist?.last_name, lobbyist?.suffix_display || lobbyist?.suffix]),
    covered_position: lobbyistEntry.covered_position,
    newly_listed_on_activity: lobbyistEntry.new,
    general_issue_code: activity.general_issue_code,
    general_issue_code_display: activity.general_issue_code_display,
    activity_description: activity.description,
    activity_index: activityIndex,
  });
}

if (!years.length) {
  throw new Error("Set LDA_FILING_YEARS or pass --year=YYYY / --years=YYYY,YYYY.");
}

fs.mkdirSync(outDir, { recursive: true });

const filings = [];
for (const year of years) {
  filings.push(...await fetchFilingsForYear(year));
}

const filingRows = [];
const lobbyists = new Map();
const links = [];
const registrants = new Map();
const clients = new Map();

for (const filing of filings) {
  filingRows.push(normalizeFiling(filing));

  const registrant = normalizeRegistrant(filing.registrant);
  if (registrant) registrants.set(registrant.registrant_id, registrant);

  const client = normalizeClient(filing.client);
  if (client) clients.set(client.client_id, client);

  (filing.lobbying_activities || []).forEach((activity, activityIndex) => {
    (activity.lobbyists || []).forEach((lobbyistEntry) => {
      const lobbyist = normalizeLobbyist(lobbyistEntry.lobbyist);
      if (!lobbyist) return;
      lobbyists.set(lobbyist.lobbyist_id, lobbyist);
      links.push(normalizeLobbyistLink({ filing, activity, lobbyistEntry, activityIndex }));
    });
  });
}

filingRows.sort((a, b) => filingPeriodRank(b) - filingPeriodRank(a) || String(b.dt_posted || "").localeCompare(String(a.dt_posted || "")));
links.sort((a, b) => filingPeriodRank(b) - filingPeriodRank(a) || String(a.lobbyist_name || "").localeCompare(String(b.lobbyist_name || "")));

fs.writeFileSync(path.join(outDir, "filings.jsonl"), filingRows.map(jsonlLine).join(""));
fs.writeFileSync(path.join(outDir, "lobbyists.jsonl"), [...lobbyists.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(jsonlLine).join(""));
fs.writeFileSync(path.join(outDir, "lobbyist-filing-links.jsonl"), links.map(jsonlLine).join(""));
fs.writeFileSync(path.join(outDir, "registrants.jsonl"), [...registrants.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(jsonlLine).join(""));
fs.writeFileSync(path.join(outDir, "clients.jsonl"), [...clients.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(jsonlLine).join(""));

console.log(`Refreshed LDA normalized data for ${years.join(", ")}: ${filingRows.length.toLocaleString()} filings, ${lobbyists.size.toLocaleString()} lobbyists, ${links.length.toLocaleString()} lobbyist-filing links.`);
