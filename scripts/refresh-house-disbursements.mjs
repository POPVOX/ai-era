import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { disbursementSourcePath, loadDisbursementSources, periodPartsFromFilename } from "./house-disbursement-utils.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "house-expenditure-explorer-2026-05-01");
const rawDir = path.join(sourceRoot, "data", "raw");
const sourcePath = path.join(root, disbursementSourcePath);
const shouldBuild = process.argv.includes("--build");

const quarterSequence = [
  { order: 1, label: "Jan-Mar", filePrefix: "JAN-MAR", longPrefix: "JANUARY-MARCH", publishMonth: "05", publishYearOffset: 0 },
  { order: 2, label: "Apr-Jun", filePrefix: "APR-JUN", longPrefix: "APRIL-JUNE", publishMonth: "08", publishYearOffset: 0 },
  { order: 3, label: "Jul-Sep", filePrefix: "JULY-SEPTEMBER", longPrefix: "JULY-SEPTEMBER", publishMonth: "11", publishYearOffset: 0, grids: true },
  { order: 4, label: "Oct-Dec", filePrefix: "OCT-DEC", longPrefix: "OCT-DEC", publishMonth: "02", publishYearOffset: 1 },
];

function nextQuarter(parts) {
  const current = quarterSequence.find((item) => item.order === parts.order) || quarterSequence[0];
  if (current.order === 4) return { ...quarterSequence[0], year: parts.year + 1 };
  return { ...quarterSequence[current.order], year: parts.year };
}

function canonicalFilename(quarter) {
  return `${quarter.filePrefix}-${quarter.year}-SOD-DETAIL-GRID-FINAL.csv`;
}

function encodedFilename(prefix, year, separator) {
  return encodeURIComponent(`${prefix}${separator}${year}${separator}SOD${separator}DETAIL${separator}GRID-FINAL.csv`);
}

function candidateUrls(quarter) {
  const publishYear = quarter.year + quarter.publishYearOffset;
  const base = `https://www.house.gov/sites/default/files/${publishYear}-${quarter.publishMonth}`;
  const hyphenated = `${quarter.filePrefix}-${quarter.year}-SOD-DETAIL-GRID-FINAL.csv`;
  const longHyphenated = `${quarter.longPrefix}-${quarter.year}-SOD-DETAIL-GRID-FINAL.csv`;
  const longSpaced = encodedFilename(quarter.longPrefix, quarter.year, " ");
  const shortSpaced = encodedFilename(quarter.filePrefix, quarter.year, " ");
  const paths = [
    `${base}/${hyphenated}`,
    `${base}/${longHyphenated}`,
    `${base}/${longSpaced}`,
    `${base}/${shortSpaced}`,
  ];
  if (quarter.grids) {
    paths.push(`${base}/grids/${longSpaced}`);
    paths.push(`${base}/grids/${shortSpaced}`);
    paths.push(`${base}/grids/${hyphenated}`);
  }
  return [...new Set(paths)];
}

function latestKnownFile(files) {
  return [...files].sort((a, b) => {
    const aParts = periodPartsFromFilename(a);
    const bParts = periodPartsFromFilename(b);
    return (bParts.year * 10 + bParts.order) - (aParts.year * 10 + aParts.order);
  })[0];
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "POPVOX disbursement refresh bot",
    },
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text.includes("SORT SEQUENCE") || !text.includes("VENDOR NAME")) return null;
  return text;
}

async function downloadKnownSources(sources) {
  fs.mkdirSync(rawDir, { recursive: true });
  for (const [fileName, url] of Object.entries(sources.files || {})) {
    const target = path.join(rawDir, fileName);
    if (fs.existsSync(target)) continue;
    const text = await fetchText(url);
    if (!text) throw new Error(`Unable to download known House disbursement source: ${url}`);
    fs.writeFileSync(target, text);
    console.log(`Downloaded known source ${fileName}`);
  }
}

function saveSources(sources) {
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, `${JSON.stringify(sources, null, 2)}\n`);
}

function buildDisbursementData() {
  execFileSync("node", ["scripts/build-house-expenditure-data.mjs"], { cwd: root, stdio: "inherit" });
  execFileSync("node", ["scripts/build-house-staff-data.mjs"], { cwd: root, stdio: "inherit" });
}

const sources = loadDisbursementSources(root);
const knownFiles = Object.keys(sources.files || {});
if (!knownFiles.length) throw new Error(`No House disbursement sources found in ${disbursementSourcePath}`);

await downloadKnownSources(sources);

const latestFile = latestKnownFile(knownFiles);
const next = nextQuarter(periodPartsFromFilename(latestFile));
const nextFile = canonicalFilename(next);

if (sources.files[nextFile]) {
  console.log(`Already tracking ${nextFile}`);
  process.exit(0);
}

console.log(`Checking for ${next.label} ${next.year} House disbursement data...`);
let found = null;
for (const url of candidateUrls(next)) {
  console.log(`Checking ${url}`);
  const text = await fetchText(url);
  if (text) {
    found = { url, text };
    break;
  }
}

if (!found) {
  console.log(`No new House disbursement CSV found for ${next.label} ${next.year}.`);
  process.exit(0);
}

fs.writeFileSync(path.join(rawDir, nextFile), found.text);
sources.files[nextFile] = found.url;
saveSources(sources);
console.log(`Added ${nextFile} from ${found.url}`);

if (shouldBuild) buildDisbursementData();
