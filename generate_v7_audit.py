import json
import math
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd


ROOT = Path(__file__).resolve().parent
SOURCE_XLSX = ROOT / "snitcher_export_20260710_104110_hWtnzX1GVQ.xlsx"
BLUEPRINT_JSON = ROOT / "Visit-Parse Domain Info.blueprint.json"
OUT_DIR = ROOT / "outputs"
OUT_JSON = OUT_DIR / "h4a_v7_audit_data.json"
OUT_CSV = OUT_DIR / "h4a_v7_audit.csv"


def is_blank(value):
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip() == ""


def clean(value):
    if is_blank(value):
        return ""
    return str(value).strip()


def seconds_from_time(value):
    if is_blank(value):
        return 0
    if hasattr(value, "total_seconds"):
        return int(value.total_seconds())
    text = str(value).strip()
    parts = text.split(":")
    if len(parts) == 3:
        try:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
        except ValueError:
            return 0
    return 0


def normalize_domain(value):
    text = clean(value)
    if not text:
        return ""
    candidate = text if "://" in text else f"https://{text}"
    parsed = urlparse(candidate)
    host = parsed.netloc or parsed.path
    return host.lower().removeprefix("www.")


def extract_page_paths(value):
    text = clean(value)
    if not text:
        return ""
    paths = []
    for item in text.split(","):
        url = item.strip()
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme or parsed.netloc:
            path_text = parsed.path or "/"
            if parsed.query:
                path_text = f"{path_text}?{parsed.query}"
        else:
            path_text = url
        paths.append(path_text)
    return ", ".join(paths)


def find_keyword_matches(text, keywords):
    lower = clean(text).lower()
    return [kw for kw in keywords if kw.lower() in lower]


def target_values(employee_range):
    value = clean(employee_range)
    if value == "11-50 employees":
        return 100, 100
    if value == "51-200 employees":
        return 40, 60
    if value == "201-500 employees":
        return 40, 60
    if value == "501-1000 employees":
        return 40, 50
    if value in ("1001-5000 employees", "5001-10000 employees", "5001-10,000 employees"):
        return 40, 60
    if value in ("10,001+ employees", "10001+ employees"):
        return 40, 60
    return "", ""


def load_make_rules():
    blueprint = json.loads(BLUEPRINT_JSON.read_text())
    variables = {}
    for module in blueprint["flow"]:
        if module.get("id") == 2:
            for item in module["mapper"]["variables"]:
                variables[item["name"]] = item["value"]
            break
    return {
        "industries": [item.strip() for item in variables["industries"].split(",") if item.strip()],
        "urls": [item.strip() for item in variables["urls"].split(",") if item.strip()],
    }


def main():
    OUT_DIR.mkdir(exist_ok=True)
    rules = load_make_rules()
    df = pd.read_excel(SOURCE_XLSX, sheet_name="Worksheet")

    rows = []
    for index, row in df.iterrows():
        name = clean(row.get("Name"))
        website = clean(row.get("Website"))
        domain = normalize_domain(website)
        industry = clean(row.get("Industry"))
        employee_range = clean(row.get("Company Size"))
        pages = clean(row.get("Unique pages Visited"))
        page_paths = extract_page_paths(pages)
        total_time = clean(row.get("Total time on Site"))
        total_seconds = seconds_from_time(row.get("Total time on Site"))

        matched_industry = find_keyword_matches(industry, rules["industries"])
        matched_urls = find_keyword_matches(page_paths, rules["urls"])
        it_target, biz_target = target_values(employee_range)

        drop_reasons = []
        if not domain:
            drop_reasons.append("missing_domain")
        if not industry:
            drop_reasons.append("missing_industry")
        if not employee_range:
            drop_reasons.append("missing_employee_range")
        if not name:
            drop_reasons.append("missing_company_name")
        if matched_industry:
            drop_reasons.append("partner_industry_exclusion")
        if not matched_urls:
            drop_reasons.append("no_high_intent_url")
        if employee_range in ("1-10 employees", "Unknown"):
            drop_reasons.append("employee_range_excluded")

        status = "PASS" if not drop_reasons else "DROP"

        rows.append(
            {
                "source_row": index + 2,
                "status": status,
                "primary_drop_reason": drop_reasons[0] if drop_reasons else "",
                "all_drop_reasons": "; ".join(drop_reasons),
                "matched_url_keywords": ", ".join(matched_urls),
                "matched_industry_keywords": ", ".join(matched_industry),
                "name": name,
                "domain": domain,
                "website": website,
                "industry": industry,
                "employee_range": employee_range,
                "it_target": it_target if status == "PASS" else "",
                "biz_target": biz_target if status == "PASS" else "",
                "total_time_on_site": total_time,
                "total_time_seconds": total_seconds,
                "total_visits": row.get("Total Visits", ""),
                "total_pageviews": row.get("Total Pageviews", ""),
                "unique_pages_visited": pages,
                "page_paths_used_for_url_match": page_paths,
                "country": clean(row.get("Country")),
                "state": clean(row.get("State")),
                "city": clean(row.get("City")),
            }
        )

    audit = pd.DataFrame(rows)
    industry_excluded = audit[audit["all_drop_reasons"].str.contains("partner_industry_exclusion", na=False)]

    summary = {
        "source_file": SOURCE_XLSX.name,
        "blueprint_file": BLUEPRINT_JSON.name,
        "row_count": int(len(audit)),
        "pass_count": int((audit["status"] == "PASS").sum()),
        "drop_count": int((audit["status"] == "DROP").sum()),
        "pass_rate": float((audit["status"] == "PASS").mean()) if len(audit) else 0,
        "industry_excluded_rows": int(len(industry_excluded)),
        "industry_keywords": rules["industries"],
        "url_keywords": rules["urls"],
        "drop_reason_counts": audit[audit["primary_drop_reason"] != ""]["primary_drop_reason"]
        .value_counts()
        .to_dict(),
        "matched_industry_keyword_counts": audit["matched_industry_keywords"]
        .replace("", pd.NA)
        .dropna()
        .str.split(", ")
        .explode()
        .value_counts()
        .to_dict(),
        "matched_url_keyword_counts": audit["matched_url_keywords"]
        .replace("", pd.NA)
        .dropna()
        .str.split(", ")
        .explode()
        .value_counts()
        .to_dict(),
        "pass_by_employee_range": audit[audit["status"] == "PASS"]["employee_range"].value_counts().to_dict(),
    }

    dropped = audit[audit["status"] == "DROP"].copy()
    industry_drops = (
        dropped.assign(industry=lambda x: x["industry"].replace("", "(missing industry)"))
        .groupby("industry", dropna=False)
        .agg(
            drop_count=("status", "size"),
            percent_of_drops=("status", lambda x: len(x) / len(dropped) if len(dropped) else 0),
            sample_companies=("name", lambda x: ", ".join(list(x.head(5)))),
        )
        .reset_index()
        .sort_values(["drop_count", "industry"], ascending=[False, True])
        .to_dict("records")
    )

    keyword_rows = []
    for keyword in rules["industries"]:
        mask = industry_excluded["matched_industry_keywords"].str.split(", ").apply(
            lambda values: keyword in values if isinstance(values, list) else False
        )
        matched = industry_excluded[mask]
        if len(matched):
            keyword_rows.append(
                {
                    "industry_keyword": keyword,
                    "excluded_row_count": int(len(matched)),
                    "percent_of_industry_excluded_rows": float(len(matched) / len(industry_excluded))
                    if len(industry_excluded)
                    else 0,
                    "sample_industries": ", ".join(list(matched["industry"].drop_duplicates().head(8))),
                    "sample_companies": ", ".join(list(matched["name"].head(5))),
                }
            )
    keyword_rows.sort(key=lambda item: (-item["excluded_row_count"], item["industry_keyword"]))

    payload = {
        "summary": summary,
        "rows": rows,
        "industry_drops": industry_drops,
        "keyword_drops": keyword_rows,
    }

    audit.to_csv(OUT_CSV, index=False)
    OUT_JSON.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
