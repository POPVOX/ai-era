# POPVOX AI Era Site

Prototype public site for the next POPVOX direction: a polished landing site plus early public explorers that show what is possible with structured legislative data.

The site is intentionally lightweight. Most pages are static HTML/CSS/JS, with a small local Node server used for live CongressLink proxy calls where an API token is required.

## What Is Included

- Public pages: Home, About, People, News, Contact, Privacy, and Terms.
- Explorer pages:
  - Lawmaker Explorer
  - Legislation Explorer
  - Committee Explorer
  - Congressional Staff Explorer
  - Registered Lobbyist Explorer
  - Witness Explorer
  - Senate Witness Explorer
  - House Journal Explorer
  - Executive Reports Dashboard
  - House Rules Explorer
  - House Expenditure Explorer
  - Senate Disbursement Explorer
  - Senate Committee Explorer
- Generated detail pages:
  - Bill pages in `bills/`
  - Committee pages in `committees/`
  - Committee event pages in `events/`
  - Senate committee pages in `senate-committees/`
  - Witness profile pages in `witnesses/`
  - Senate witness profile pages in `senate-witnesses/`
  - Senate published hearing pages in `senate-events/`
  - Staff profile pages in `staffers/`
  - Registered lobbyist profile pages in `lobbyists/`
  - Vendor transaction profiles through `vendor.html?v=:slug`

## Local Setup

This project uses Node.js only. There are no package dependencies at the moment.

```bash
npm run check
PORT=8771 CONGRESSLINK_API_TOKEN="your-token" npm start
```

Then open:

```text
http://127.0.0.1:8771/
```

The local server provides:

- `/api/members`
- `/api/legislation`
- `/api/bill/:id`

These proxy routes keep the CongressLink token out of browser-side JavaScript.

## Build Commands

Regenerate static pages from the current data files:

```bash
npm run build
```

Regenerate imported data files from the local source/reference corpus:

```bash
npm run build:data
```

Refresh the normalized LDA source files from LDA.gov, then regenerate the Registered Lobbyist Explorer:

```bash
LDA_API_KEY="your-token" LDA_FILING_YEARS="2026" npm run refresh:lobbyists
```

To pull more than one filing year, use a comma-separated list:

```bash
LDA_API_KEY="your-token" LDA_FILING_YEARS="2026,2025" npm run refresh:lobbyists
```

Run JavaScript syntax checks:

```bash
npm run check
```

## Data Notes

The public site uses committed static data in `assets/` for the journal, reports, witness corpus, committee/event pages, bill pages, and House expenditure prototype.

The House Committee Explorer and Witness Explorer use:

- `data/house-committee-corpus/events.jsonl` for House committee hearings, markups, witnesses, and event metadata.
- `data/house-committee-corpus/documents.jsonl` for event source documents from docs.house.gov.
- `assets/witness-directory-data.{json,js}` for the searchable witness directory and witness profile pages.
- `scripts/refresh-house-committee-corpus.mjs` to scan docs.house.gov for recent and upcoming House committee calendar additions.
- `.github/workflows/refresh-house-committees.yml` to refresh House committee and witness data daily.

The House committee refresh scans a rolling docs.house.gov window, merges new or updated event and document records into the committed corpus, rebuilds committee pages and witness directory data, creates missing witness profile pages, and commits generated changes only when the source data changed.

To run the same refresh locally:

```bash
npm run refresh:house-committees
```

The House Expenditure Explorer uses:

- `assets/house-expenditure-data.{json,js}` for dashboard metrics, charts, filters, and vendor rollups.
- `assets/house-expenditure-transactions.json` as the full transaction fallback bundle.
- `assets/house-expenditure-vendors/*.json` for fast-loading transaction profiles for the largest vendors.
- `data/house-disbursement-sources.json` to track the official House Statement of Disbursements CSV URLs used by the expenditure and staff builds.

The Congressional Staff Explorer uses:

- `assets/house-staff-data.{json,js}` for searchable House staff names, offices, titles, and period metadata.
- `assets/senate-disbursement-data.{json,js}` for searchable Senate staff profiles extracted from PDF reports.
- `staffers/*.html` for generated House staff profile pages.

Staff profiles are inferred from public House Statement of Disbursements personnel rows and public Secretary of the Senate PDF reports. Compensation values are present in the public source data but are intentionally excluded from the public interface because this prototype is focused on staff identity, office context, and role history.

House disbursement refreshes are checked by `.github/workflows/refresh-house-disbursements.yml` every Monday and can also be run manually from GitHub Actions. The workflow checks the next expected quarterly House CSV URL, downloads it when available, rebuilds the House Expenditure and House Staff static data, and commits the refreshed generated files.

To run the same refresh locally:

```bash
npm run refresh:house-disbursements
```

The Registered Lobbyist Explorer uses:

- `assets/lobbyist-data.{json,js}` for searchable public LDA lobbyist, client, registrant, filing, and covered-position metadata.
- `lobbyists/*.html` for generated registered lobbyist profile pages with links back to public LDA filings.
- `scripts/refresh-lda-data.mjs` to refresh the local normalized JSONL source files from the official LDA.gov API.

Lobbyist profiles summarize public filing relationships. They should be treated as a source-record index, not as an assertion about current representation without checking the linked filing.

The Senate Disbursement Explorer uses:

- `assets/senate-disbursement-data.{json,js}` for staff profiles, vendors, transaction rows, charts, and source references extracted from public PDF reports.
- `scripts/build-senate-disbursement-data.py` to download and parse the 2025-overlapping Secretary of the Senate reports from GovInfo.
- `.github/workflows/refresh-senate-disbursements.yml` to rebuild the Senate data weekly.

Senate reports are currently PDF-only. The Oct. 1, 2024 to Mar. 31, 2025 report period overlaps 2024/2025; matching records from that report are included with a visible caveat.

The Senate Committee Explorer uses:

- `assets/senate-committee-data.{json,js}` for Senate committees, subcommittees, committee members, subcommittee rosters, upcoming meetings, historical Congress.gov meetings, and linked published GovInfo hearings.
- `scripts/build-senate-committee-data.mjs` to refresh official Senate.gov committee membership XML files, the Senate hearings and meetings XML feed, and Congress.gov historical committee meeting records when a Congress.gov key is configured.
- `scripts/link-senate-published-hearings.mjs` to connect generated GovInfo Senate hearing pages from the Senate Witness Explorer into matching Senate committee records.
- `scripts/build-senate-committee-pages.mjs` to generate static Senate committee profile pages from the linked committee dataset.
- `.github/workflows/refresh-senate-committees.yml` to rebuild the Senate committee data weekly.

Senate committee membership XML represents current rosters. The Senate hearings XML is a live/upcoming schedule, not a historical archive. Historical Senate meetings come from the Congress.gov committee-meeting API, which can include witnesses, witness documents, meeting documents, transcripts, videos, and related bills or nominations when those details are available. Congress.gov states Senate meeting announcements are available from June 2019 to present. Published hearing pages come from GovInfo and are linked to committees when the extracted committee name matches the current Senate.gov roster.

To refresh Senate committee data with historical Congress.gov meetings locally:

```bash
CONGRESS_GOV_API_KEY="your-token" CONGRESS_GOV_SENATE_MEETING_CONGRESSES="119,118,117" npm run refresh:senate-committee-history
```

The Senate Witness Explorer uses:

- `assets/senate-witness-data.{json,js}` for witness profiles extracted from published Senate hearing records.
- `senate-witnesses/*.html` for generated Senate witness profile pages.
- `senate-events/*.html` for generated Senate published hearing pages with witnesses and official source documents.
- `scripts/build-senate-witness-data.mjs` to search GovInfo Congressional Hearings (`CHRG`) records, fetch Senate hearing HTML, parse panel-of-witnesses tables of contents, attach official GovInfo PDF/HTML links, and generate linked event pages.

GovInfo is an archival publication layer. GovInfo notes that most hearings are published two months to two years after they are held, and not all hearings are available. The Senate Witness Explorer therefore reflects published hearing records, not all scheduled Senate hearings. LinkedIn, Google Scholar, web, and image links are research starting points until verified profile URLs are attached.

To refresh Senate witness data locally:

```bash
GOVINFO_API_KEY="your-token" SENATE_WITNESS_CONGRESSES="119" npm run build:senate-witnesses
```

Generated pages and generated data are committed so the site can be deployed as a mostly static site. Live CongressLink-backed pages still need the local/server proxy routes listed above unless an equivalent production proxy is provided.

The local folder `Committee Corpus + Witness Directory - CTO Share/` is source/reference material used during development. It is intentionally ignored by Git because it is large and contains raw working files that do not need to ship with the public site.

## Environment Variables

- `PORT`: local server port. Defaults to `8770`.
- `CONGRESSLINK_API_TOKEN`: required for live member, legislation, and bill-detail API proxy routes.
- `CONGRESSLINK_API_BASE`: optional override for the CongressLink API host.
- `CONGRESSLINK_MEMBERS_ENDPOINTS`: optional comma-separated member endpoints. Defaults to House and Senate member endpoints.
- `CONGRESSLINK_LEGISLATION_ENDPOINT`: optional bill endpoint override.
- `CONGRESS_GOV_API_KEY`: optional Congress.gov API token for Senate historical committee meeting refreshes.
- `CONGRESS_GOV_SENATE_MEETING_CONGRESSES`: comma-separated congresses to pull for Senate committee meetings. Defaults to `119`.
- `SENATE_MEETING_DETAIL_LIMIT`: optional cap on detailed Senate meeting records fetched during a refresh. Defaults to `150`.
- `GOVINFO_API_KEY`: optional GovInfo API token for Senate witness refreshes. Defaults to `DEMO_KEY`, which is suitable only for very small tests.
- `SENATE_WITNESS_CONGRESSES`: comma-separated congresses to pull for published Senate hearing witnesses. Defaults to `119`.
- `SENATE_WITNESS_MAX_HEARINGS`: optional cap on GovInfo Senate hearing records fetched. Defaults to `260`.
- `LDA_API_KEY`: optional LDA.gov API token for higher refresh rate limits. The LDA API also supports anonymous requests with stricter throttling.
- `LDA_API_BASE`: optional override for the LDA API host. Defaults to `https://lda.gov/api/v1`.
- `LDA_FILING_YEARS`: comma-separated filing years to refresh. Defaults to the current calendar year.
- `LDA_PAGE_SIZE`: optional LDA pagination size. Defaults to `100`.
- `LDA_REQUEST_DELAY_MS`: optional delay between LDA API requests.
- `LDA_MAX_PAGES`: optional cap for smoke-testing the refresh script without pulling a full year.
- `LDA_OUTPUT_DIR`: optional normalized JSONL output directory. Defaults to the local ignored witness corpus path used by `scripts/build-lobbyist-data.mjs`.

Do not commit API tokens. Keep local secrets in shell environment variables or an untracked `.env` file.

## Deployment Notes

For a static-only deployment, the generated HTML/CSS/JS/assets can be hosted directly, but live CongressLink-backed features need a server or edge function to provide the API proxy routes above.

Before pushing or deploying:

```bash
npm run check
npm run build
```

Then spot-check:

- `/`
- `/explore.html`
- `/members.html`
- `/legislation.html`
- `/committees.html`
- `/senate-committees.html`
- `/senate-witnesses.html`
- `/staff.html`
- `/senate-disbursements.html`
- `/lobbyists.html`
- `/witnesses.html`
- `/journal.html`
- `/reports.html`
- `/rules.html`
- `/expenditures.html`
- `/vendor.html?v=citibank`
