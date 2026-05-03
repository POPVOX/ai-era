#!/usr/bin/env python3
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

try:
    import fitz
except ImportError as exc:
    raise SystemExit(
        "Missing Python package PyMuPDF. Install with `python3 -m pip install pymupdf`."
    ) from exc


ROOT = Path.cwd()
RAW_DIR = ROOT / "data" / "senate-disbursements" / "raw"
OUT_JSON = ROOT / "assets" / "senate-disbursement-data.json"
OUT_JS = ROOT / "assets" / "senate-disbursement-data.js"

SENATE_INDEX_URL = "https://www.senate.gov/legislative/common/generic/report_secsen.htm"
TARGET_YEAR = 2025
MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

MONEY_RE = re.compile(r"^\$ ?\(?-?[\d,]+\.\d{2}\)?$")
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
DOCUMENT_RE = re.compile(r"^[A-Z]{2,}[A-Z0-9-]*$")
NAME_RE = re.compile(r"^[A-Z][A-Z .,'&/-]+,\s+[A-Z][A-Z .,'&/-]+$")

HEADER_MARKERS = {
    "DESCRIPTION NET FUNDS",
    "AVAILABLE AS",
    "NET EXPENDITURES FOR",
    "THE PERIOD OF",
    "TOTAL FUNDING",
    "Authorization",
    "Supplementals",
    "Transfers",
    "Resc / Withdrawals",
    "ORGANIZATION TOTALS",
    "UNEXPENDED BALANCE",
    "DOCUMENT NO. DATE",
    "POSTED",
    "PAYEE NAME OBLIGATION/SERVICE",
    "DATES",
    "START END",
    "DETAILED AND SUMMARY STATEMENT OF EXPENDITURES",
}

SUMMARY_PREFIXES = (
    "PERSONNEL COMP.",
    "PERSONNEL BENEFITS",
    "NET PAYROLL EXPENSES",
    "TRAVEL AND TRANSPORTATION",
    "TRANSPORTATION OF THINGS",
    "RENT, COMMUNICATIONS",
    "PRINTING AND REPRODUCTION",
    "OTHER CONTRACTUAL SERVICES",
    "SUPPLIES AND MATERIALS",
    "ACQUISITION OF ASSETS",
    "TOTAL",
)


def money(value):
    raw = str(value or "").replace("$", "").replace(",", "").replace(" ", "").strip()
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    if not raw:
        return 0.0
    amount = float(raw)
    return -amount if negative else amount


def normalize_period_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def parse_period_date(value):
    match = re.match(r"([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})", value.strip())
    if not match:
        return ""
    month = MONTHS.get(match.group(1).lower())
    if not month:
        return ""
    return f"{int(match.group(3)):04d}-{month:02d}-{int(match.group(2)):02d}"


def parse_period(value):
    parts = re.split(r"\s+to\s+", normalize_period_text(value), flags=re.I)
    if len(parts) != 2:
        return "", ""
    return parse_period_date(parts[0]), parse_period_date(parts[1])


def overlaps_target_year(start, end):
    return bool(start and end and start <= f"{TARGET_YEAR}-12-31" and end >= f"{TARGET_YEAR}-01-01")


def caveat_for_period(start, end):
    if start < f"{TARGET_YEAR}-01-01" and end > f"{TARGET_YEAR}-12-31":
        return f"Report period overlaps {TARGET_YEAR - 1}/{TARGET_YEAR}/{TARGET_YEAR + 1}"
    if start < f"{TARGET_YEAR}-01-01":
        return f"Report period overlaps {TARGET_YEAR - 1}/{TARGET_YEAR}"
    if end > f"{TARGET_YEAR}-12-31":
        return f"Report period overlaps {TARGET_YEAR}/{TARGET_YEAR + 1}"
    return ""


def discover_reports():
    html = urllib.request.urlopen(SENATE_INDEX_URL, timeout=30).read().decode("utf8", errors="replace")
    anchors = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, flags=re.I | re.S)
    reports = []
    current_period = ""
    for href, raw_text in anchors:
        text = normalize_period_text(re.sub(r"<[^>]+>", " ", raw_text))
        if re.search(r"\bto\b", text) and re.search(r"\b20\d{2}\b", text):
            current_period = text
            continue
        if text != "Full Report" or not current_period:
            continue
        start, end = parse_period(current_period)
        if not overlaps_target_year(start, end):
            current_period = ""
            continue
        doc_id_match = re.search(r"/pkg/(GPO-CDOC-[^/]+)/", href)
        doc_id = doc_id_match.group(1) if doc_id_match else slugify(current_period)
        reports.append({
            "id": doc_id,
            "title": "Report of the Secretary of the Senate",
            "period": current_period,
            "periodStart": start,
            "periodEnd": end,
            "overlapCaveat": caveat_for_period(start, end),
            "pdfUrl": href,
            "pdf": RAW_DIR / f"{doc_id}.pdf",
        })
        current_period = ""
    return reports


def parse_date(value):
    try:
        return datetime.strptime(value, "%m/%d/%Y").date().isoformat()
    except ValueError:
        return ""


def in_2025(*values):
    return any(str(value).startswith("2025-") for value in values if value)


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return slug[:90] or "record"


def clean_line(line):
    line = re.sub(r"\s+", " ", line or "").strip()
    line = re.sub(r"([A-Z])\$(\s?\d)", r"\1 $\2", line)
    return line


def read_until(lines, start, stop):
    values = []
    i = start
    while i < len(lines) and not stop(lines[i]):
        if not should_skip_line(lines[i]):
            values.append(lines[i])
        i += 1
    return " ".join(values).strip(), i


def extract_context(lines, prior):
    context = dict(prior)
    for idx, line in enumerate(lines):
        if line != "DETAILED AND SUMMARY STATEMENT OF EXPENDITURES":
            continue
        office = []
        j = idx + 1
        while j < len(lines) and not lines[j].startswith("Funding Year"):
            if lines[j] and not re.match(r"^B-\d+", lines[j]):
                office.append(lines[j])
            j += 1
        if office:
            context["office"] = " ".join(office).strip()
        if j < len(lines):
            year_match = re.search(r"(\d{4}(?:-\d{4})?)", lines[j])
            if year_match:
                context["fundingYear"] = year_match.group(1)
        appropriation = []
        k = j + 1
        while k < len(lines) and not re.match(r"^B-\d+", lines[k]):
            if lines[k] and not lines[k].startswith("Funding Year"):
                appropriation.append(lines[k])
            k += 1
        if appropriation:
            context["appropriation"] = " ".join(appropriation).strip()
        if k < len(lines):
            context["reportPage"] = lines[k]
    return context


def office_type(office, appropriation):
    text = f"{office} {appropriation}".upper()
    if "SENATOR " in text or "SENATORS’ OFFICIAL" in text or "SENATORS' OFFICIAL" in text:
        return "Senator offices"
    if "COMMITTEE" in text:
        return "Committees"
    if "MAJORITY" in text or "MINORITY" in text or "PRESIDENT PRO TEMPORE" in text:
        return "Leadership"
    if "SECRETARY OF THE SENATE" in text or "SERGEANT AT ARMS" in text or "CHAPLAIN" in text:
        return "Institutional"
    return "Other Senate offices"


def expense_type(description):
    text = description.upper()
    if "PAYROLL" in text or "PERSONNEL COMP" in text:
        return "Salaries and payroll"
    if "TRAVEL" in text or "TRANSPORTATION" in text:
        return "Travel and transportation"
    if "RENT" in text or "COMMUNICATION" in text or "UTILIT" in text:
        return "Rent, communications, utilities"
    if "PRINT" in text or "REPRODUCTION" in text:
        return "Printing and reproduction"
    if "SUPPL" in text:
        return "Supplies and materials"
    if "SOFTWARE" in text or "LICENSE" in text or "DATA" in text:
        return "Software, data, and subscriptions"
    if "EQUIP" in text or "ASSET" in text:
        return "Equipment and assets"
    if "CONTRACT" in text or "SERVICE" in text:
        return "Contracts and services"
    return "Other operating costs"


def should_skip_line(line):
    if not line or line in HEADER_MARKERS:
        return True
    if re.match(r"^\(?[ivxlcdm]+\)?$", line.lower()):
        return True
    if re.match(r"^B-\d+", line):
        return True
    if line.startswith("Funding Year"):
        return True
    if line.startswith("UNEXPENDED BALANCE"):
        return True
    if line.startswith("ORGANIZATION TOTALS"):
        return True
    return False


def parse_report(report):
    if not report["pdf"].exists():
        report["pdf"].parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {report['id']} from {report['pdfUrl']}")
        urllib.request.urlretrieve(report["pdfUrl"], report["pdf"])
    if not report["pdf"].exists():
        raise FileNotFoundError(f"Missing Senate PDF: {report['pdf']}")

    reader = fitz.open(str(report["pdf"]))
    context = {"office": "", "fundingYear": "", "appropriation": "", "reportPage": ""}
    transactions = []
    staff_rows = []

    for page_index, page in enumerate(reader, start=1):
        raw_text = page.get_text("text") or ""
        lines = [clean_line(line) for line in raw_text.splitlines()]
        lines = [line for line in lines if line]
        context = extract_context(lines, context)
        office = context.get("office", "")
        appropriation = context.get("appropriation", "")
        office_kind = office_type(office, appropriation)

        i = 0
        while i < len(lines):
            line = lines[i]
            if should_skip_line(line):
                i += 1
                continue
            if any(line.upper().startswith(prefix) for prefix in SUMMARY_PREFIXES):
                i += 1
                continue

            if DOCUMENT_RE.match(line) and i + 5 < len(lines) and DATE_RE.match(lines[i + 1]):
                document = line
                posted = parse_date(lines[i + 1])
                payee, j = read_until(lines, i + 2, lambda value: bool(DATE_RE.match(value)))
                if j + 3 >= len(lines) or not DATE_RE.match(lines[j]) or not DATE_RE.match(lines[j + 1]):
                    i += 1
                    continue
                start = parse_date(lines[j])
                end = parse_date(lines[j + 1])
                description, k = read_until(lines, j + 2, lambda value: bool(MONEY_RE.match(value)))
                if k >= len(lines):
                    i += 1
                    continue
                amount = lines[k]
                if not in_2025(posted, start, end):
                    i = k + 1
                    continue
                transactions.append({
                    "chamber": "Senate",
                    "sourceReport": report["id"],
                    "sourcePdfUrl": report["pdfUrl"],
                    "reportPeriod": report["period"],
                    "reportPeriodStart": report["periodStart"],
                    "reportPeriodEnd": report["periodEnd"],
                    "overlapCaveat": report["overlapCaveat"],
                    "page": page_index,
                    "reportPage": context.get("reportPage", ""),
                    "document": document,
                    "postedDate": posted,
                    "serviceStart": start,
                    "serviceEnd": end,
                    "payee": payee,
                    "description": description,
                    "amount": money(amount),
                    "office": office,
                    "officeType": office_kind,
                    "appropriation": appropriation,
                    "fundingYear": context.get("fundingYear", ""),
                    "expenseType": expense_type(description),
                })
                i = k + 1
                continue

            if NAME_RE.match(line):
                title, j = read_until(lines, i + 1, lambda value: bool(MONEY_RE.match(value)) or bool(DOCUMENT_RE.match(value)))
                if j >= len(lines) or not MONEY_RE.match(lines[j]) or not title:
                    i += 1
                    continue
                name = line
                if any(title.upper().startswith(prefix) for prefix in SUMMARY_PREFIXES):
                    i = j + 1
                    continue
                staff_rows.append({
                    "chamber": "Senate",
                    "sourceReport": report["id"],
                    "sourcePdfUrl": report["pdfUrl"],
                    "reportPeriod": report["period"],
                    "reportPeriodStart": report["periodStart"],
                    "reportPeriodEnd": report["periodEnd"],
                    "overlapCaveat": report["overlapCaveat"],
                    "page": page_index,
                    "reportPage": context.get("reportPage", ""),
                    "name": name,
                    "title": title,
                    "amount": money(lines[j]),
                    "office": office,
                    "officeType": office_kind,
                    "appropriation": appropriation,
                    "fundingYear": context.get("fundingYear", ""),
                })
                i = j + 1
                continue

            i += 1

    return transactions, staff_rows


def top(counter, limit=20):
    return [{"label": key, "count": count} for key, count in counter.most_common(limit)]


def money_rollup(rows, key):
    totals = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for row in rows:
        label = row.get(key) or "Not listed"
        totals[label]["amount"] += row.get("amount") or 0
        totals[label]["count"] += 1
    return [
        {"label": label, "amount": round(values["amount"], 2), "count": values["count"]}
        for label, values in sorted(totals.items(), key=lambda item: abs(item[1]["amount"]), reverse=True)
    ]


def build_staff_profiles(rows):
    people = {}
    for row in rows:
        slug = slugify(row["name"])
        person = people.setdefault(slug, {
            "slug": slug,
            "name": row["name"].title().replace(" Ii", " II").replace(" Iii", " III"),
            "chamber": "Senate",
            "currentOffice": row["office"],
            "currentTitle": row["title"],
            "latestPeriod": row["reportPeriod"],
            "officeCount": Counter(),
            "titleCount": Counter(),
            "periods": set(),
            "rows": [],
            "hasOverlapCaveat": False,
        })
        person["officeCount"][row["office"]] += 1
        person["titleCount"][row["title"]] += 1
        person["periods"].add(row["reportPeriod"])
        person["rows"].append(row)
        person["hasOverlapCaveat"] = person["hasOverlapCaveat"] or bool(row["overlapCaveat"])
        if row["reportPeriodEnd"] >= person["rows"][-1]["reportPeriodEnd"]:
            person["currentOffice"] = row["office"]
            person["currentTitle"] = row["title"]
            person["latestPeriod"] = row["reportPeriod"]

    profiles = []
    for person in people.values():
        profiles.append({
            "slug": person["slug"],
            "name": person["name"],
            "chamber": "Senate",
            "currentOffice": person["currentOffice"],
            "currentTitle": person["currentTitle"],
            "latestPeriod": person["latestPeriod"],
            "periods": sorted(person["periods"]),
            "officeCount": len(person["officeCount"]),
            "titleCount": len(person["titleCount"]),
            "rowCount": len(person["rows"]),
            "hasOverlapCaveat": person["hasOverlapCaveat"],
            "topOffices": top(person["officeCount"], 5),
            "topTitles": top(person["titleCount"], 5),
        })
    return sorted(profiles, key=lambda item: item["name"])


def main():
    reports = discover_reports()
    if not reports:
        raise SystemExit(f"No Secretary of the Senate reports overlapping {TARGET_YEAR} were found at {SENATE_INDEX_URL}")

    all_transactions = []
    all_staff_rows = []
    for report in reports:
        transactions, staff_rows = parse_report(report)
        all_transactions.extend(transactions)
        all_staff_rows.extend(staff_rows)
        print(f"Parsed {report['id']}: {len(transactions):,} transaction rows, {len(staff_rows):,} staff rows")

    vendors = money_rollup(all_transactions, "payee")[:500]
    staff_profiles = build_staff_profiles(all_staff_rows)
    transaction_limit = 5000
    data = {
            "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": {
            "indexUrl": SENATE_INDEX_URL,
            "reports": [
                {k: v for k, v in report.items() if k not in {"pdf"}}
                for report in reports
            ],
            "notes": [
                "Senate reports are PDF-only source documents.",
                f"Only reports whose periods overlap calendar year {TARGET_YEAR} are parsed.",
                "Payroll rows in overlapping reports do not include line-level dates, so they are included with a visible caveat.",
            ],
        },
        "metrics": {
            "transactionRows": len(all_transactions),
            "staffRows": len(all_staff_rows),
            "staffProfiles": len(staff_profiles),
            "vendors": len({row["payee"] for row in all_transactions}),
            "offices": len({row["office"] for row in all_transactions + all_staff_rows if row.get("office")}),
            "total": round(sum(row["amount"] for row in all_transactions), 2),
            "payrollTotal": round(sum(row["amount"] for row in all_staff_rows), 2),
            "transactionSampleLimit": transaction_limit,
        },
        "filters": {
            "periods": sorted({row["reportPeriod"] for row in all_transactions + all_staff_rows}),
            "officeTypes": money_rollup(all_transactions, "officeType"),
            "expenseTypes": money_rollup(all_transactions, "expenseType"),
            "offices": top(Counter(row["office"] for row in all_transactions + all_staff_rows if row.get("office")), 80),
        },
        "charts": {
            "byOfficeType": money_rollup(all_transactions, "officeType"),
            "byExpenseType": money_rollup(all_transactions, "expenseType"),
            "byPeriod": money_rollup(all_transactions, "reportPeriod"),
        },
        "vendors": vendors,
        "transactions": sorted(all_transactions, key=lambda item: abs(item["amount"]), reverse=True)[:transaction_limit],
        "staffProfiles": staff_profiles,
    }

    OUT_JSON.write_text(json.dumps(data, separators=(",", ":")), encoding="utf8")
    OUT_JS.write_text(f"window.SENATE_DISBURSEMENT_DATA = {json.dumps(data, separators=(',', ':'))};\n", encoding="utf8")
    print(f"Generated {OUT_JSON} with {len(staff_profiles):,} staff profiles and {len(all_transactions):,} transactions.")


if __name__ == "__main__":
    main()
