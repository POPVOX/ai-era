import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'Committee Corpus + Witness Directory - CTO Share', 'congressional-reports', 'congressional-reports-collector');
const reportsPath = join(sourceRoot, 'data', 'cmr', 'normalized', 'reports-enriched.jsonl');
const manifestPath = join(sourceRoot, 'data', 'cmr', 'metadata', 'manifest.json');
const outputJsonPath = join(root, 'assets', 'congressional-reports-data.json');
const outputJsPath = join(root, 'assets', 'congressional-reports-data.js');

function readJsonl(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function committeeLabel(committee) {
  const chamber = committee.chamber === 'H' ? 'House' : committee.chamber === 'S' ? 'Senate' : committee.chamber || 'Congress';
  return `${chamber}: ${committee.name || committee.authorityId || 'Unknown committee'}`;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

function sourceKind(legalAuthority = '') {
  if (/committee report|h\.?\s*rpt|s\.?\s*rpt/i.test(legalAuthority)) return 'Committee report';
  if (/public law|pub\.\s*l\.|u\.s\.c\.|act|stat\./i.test(legalAuthority)) return 'Statute';
  if (/congressional review act/i.test(legalAuthority)) return 'Statute';
  return legalAuthority ? 'Other authority' : 'Unspecified';
}

const [reportsText, manifestText] = await Promise.all([
  readFile(reportsPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
]);

const manifest = JSON.parse(manifestText);
const reports = readJsonl(reportsText).map((report) => {
  const metadata = report.cmrMetadata || {};
  const committees = (metadata.committees || []).map((committee) => ({
    label: committeeLabel(committee),
    chamber: committee.chamber || '',
    authorityId: committee.authorityId || '',
    name: committee.name || '',
    subcommittees: committee.subcommittees || [],
  }));
  const submittedToCongress = report.dateSubmittedToCongress || '';
  const submittedToGpo = report.dateSubmittedToGpo || '';
  const requiredToGpo = report.dateRequiredToBeSubmittedToGpo || '';
  const gpoDeltaDays = daysBetween(requiredToGpo, submittedToGpo);

  return {
    id: report.reportId,
    congress: report.congress,
    title: report.title || 'Untitled report',
    agency: report.submittingAgency || metadata.organizationDisplayName || 'Unknown agency',
    organization: metadata.organization || '',
    category: metadata.category || '',
    legalAuthority: metadata.legalAuthority || '',
    sourceKind: sourceKind(metadata.legalAuthority || ''),
    natureOfReport: metadata.natureOfReport || '',
    whenExpected: metadata.whenExpected || '',
    reportSubmittedTo: metadata.reportSubmittedTo || '',
    receivingChambers: metadata.receivingChambers || [],
    subjects: metadata.subjects || [],
    committees,
    submittedToCongress,
    submittedToGpo,
    requiredToGpo,
    publicationDate: report.publicationDate || '',
    receivedStatus: submittedToCongress ? 'Received by Congress' : 'No Congress receipt date',
    gpoStatus: report.isOnTime ? 'On time to GPO' : 'Late or unknown to GPO',
    isOnTime: Boolean(report.isOnTime),
    gpoDeltaDays,
    detailsLink: report.detailsLink || '',
    pdfLink: report.pdfLink || '',
    modsLink: report.modsLink || '',
    pdfSize: report.pdfSize || '',
  };
});

reports.sort((a, b) => {
  const dateCompare = String(b.submittedToCongress || b.publicationDate).localeCompare(String(a.submittedToCongress || a.publicationDate));
  if (dateCompare) return dateCompare;
  return a.title.localeCompare(b.title);
});

const agencies = [...new Set(reports.map((report) => report.agency))].sort();
const committees = [...new Set(reports.flatMap((report) => report.committees.map((committee) => committee.label)))].sort();
const sourceKinds = [...new Set(reports.map((report) => report.sourceKind))].sort();
const congresses = [...new Set(reports.map((report) => report.congress))].sort((a, b) => b - a);

const payload = {
  generatedAt: manifest.generatedAt,
  source: 'GovInfo Congressionally Mandated Reports collection',
  caveat: 'This dataset contains reports present in GovInfo CMR metadata. It can show received reports and timeliness, but not yet obligations that have never appeared in GovInfo.',
  stats: {
    reports: reports.length,
    agencies: agencies.length,
    committees: committees.length,
    onTime: reports.filter((report) => report.isOnTime).length,
    lateOrUnknown: reports.filter((report) => !report.isOnTime).length,
    receivedByCongress: reports.filter((report) => report.submittedToCongress).length,
  },
  filters: {
    agencies,
    committees,
    sourceKinds,
    congresses,
  },
  reports,
};

await mkdir(dirname(outputJsonPath), { recursive: true });
await writeFile(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(outputJsPath, `window.POPVOX_CONGRESSIONAL_REPORTS = ${JSON.stringify(payload)};\n`);

console.log(`Wrote ${reports.length} congressional reports to assets/congressional-reports-data.json and .js`);
