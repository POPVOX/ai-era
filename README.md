# POPVOX AI Era Site

Prototype public site for the next POPVOX direction: a polished landing site plus early public explorers that show what is possible with structured legislative data.

The site is intentionally lightweight. Most pages are static HTML/CSS/JS, with a small local Node server used for live CongressLink proxy calls where an API token is required.

## What Is Included

- Public pages: Home, About, People, News, Contact, Privacy, and Terms.
- Explorer pages:
  - Lawmaker Explorer
  - Legislation Explorer
  - Committee Explorer
  - Witness Explorer
  - House Journal Explorer
  - Executive Reports Dashboard
  - House Rules Explorer
- Generated detail pages:
  - Bill pages in `bills/`
  - Committee pages in `committees/`
  - Committee event pages in `events/`
  - Witness profile pages in `witnesses/`

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

Run JavaScript syntax checks:

```bash
npm run check
```

## Data Notes

The public site uses committed static data in `assets/` for the journal, reports, and witness corpus. Generated pages are committed so the site can be deployed as a mostly static site.

The local folder `Committee Corpus + Witness Directory - CTO Share/` is source/reference material used during development. It is intentionally ignored by Git because it is large and contains raw working files that do not need to ship with the public site.

## Environment Variables

- `PORT`: local server port. Defaults to `8770`.
- `CONGRESSLINK_API_TOKEN`: required for live member, legislation, and bill-detail API proxy routes.
- `CONGRESSLINK_API_BASE`: optional override for the CongressLink API host.
- `CONGRESSLINK_MEMBERS_ENDPOINTS`: optional comma-separated member endpoints. Defaults to House and Senate member endpoints.
- `CONGRESSLINK_LEGISLATION_ENDPOINT`: optional bill endpoint override.

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
- `/witnesses.html`
- `/journal.html`
- `/reports.html`
- `/rules.html`

