"""
Scrapes USA Ultimate's public Club Rankings page for the Mixed division
(current Algorithm rankings + regional Championship bid allocation) and
writes the result to data/rankings.json for the static site to consume.

Source: https://usaultimate.org/club/rankings/

Note: we deliberately scrape usaultimate.org rather than the underlying
play.usaultimate.org rankings tool. play.usaultimate.org's robots.txt
explicitly disallows Anthropic/Claude crawlers, so this scraper (which may
be run by Claude Code or a CI job acting on its behalf) only targets
usaultimate.org, whose robots.txt has no such restriction and which mirrors
the same rankings/bid-allocation data.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://usaultimate.org/club/rankings/"
DIVISION = "Mixed"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "rankings.json"

HEADERS = {
    "User-Agent": "PortAuthorityBidTracker/1.0 (+https://github.com/jakepmurray; "
    "personal fan project tracking USAU Mixed Club bid race; contact via GitHub)"
}


def parse_rating_section(section, division_name):
    table = section.select_one("table.rankings-table")
    rankings = []
    if table:
        for row in table.select("tbody tr"):
            cells = row.find_all("td")
            if len(cells) < 6:
                continue
            rank_span = cells[0].select_one("span.bid")
            bid_type = None
            if rank_span:
                classes = rank_span.get("class", [])
                for c in classes:
                    if c.startswith("bid-") and c != "bid-":
                        bid_type = c.replace("bid-", "")
            try:
                rank = int(cells[0].get_text(strip=True))
            except ValueError:
                continue
            team = cells[1].get_text(strip=True)
            record = cells[2].get_text(strip=True).replace("–", "-").replace("‑", "-")
            rating_text = cells[3].get_text(strip=True)
            try:
                rating = int(rating_text)
            except ValueError:
                rating = None
            region = cells[4].get_text(strip=True)
            trend_attr = cells[5].get("data-trend", "0")
            try:
                trend = int(trend_attr)
            except ValueError:
                trend = 0

            rankings.append(
                {
                    "rank": rank,
                    "team": team,
                    "record": record,
                    "rating": rating,
                    "region": region,
                    "trend": trend,
                    "bid_type": bid_type,
                }
            )

    bid_allocation = {}
    bid_block = section.select_one(".bid-allocation")
    if bid_block:
        for region_div in bid_block.select(".regions .region"):
            name_el = region_div.select_one(".name span")
            number_el = region_div.select_one(".number span")
            if name_el and number_el:
                try:
                    bid_allocation[name_el.get_text(strip=True)] = int(
                        number_el.get_text(strip=True)
                    )
                except ValueError:
                    pass

    last_modified = None
    if bid_block:
        copy_p = bid_block.find_next_sibling("div", class_="copy")
        if copy_p:
            match = re.search(r"Last Modified:\s*(.+)", copy_p.get_text(strip=True))
            if match:
                last_modified = match.group(1).strip()

    return {
        "division": division_name,
        "rankings": rankings,
        "bid_allocation": bid_allocation,
        "source_last_modified": last_modified,
    }


def scrape():
    resp = requests.get(SOURCE_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    for section in soup.select("section.rankings"):
        heading = section.select_one(".section-header h3")
        if not heading:
            continue
        name = heading.get_text(strip=True)
        if name.lower() == DIVISION.lower():
            data = parse_rating_section(section, DIVISION)
            data["source_url"] = SOURCE_URL
            data["scraped_at"] = datetime.now(timezone.utc).isoformat()
            return data

    raise RuntimeError(f"Could not find a '{DIVISION}' rankings section on {SOURCE_URL}")


def main():
    try:
        data = scrape()
    except Exception as exc:  # noqa: BLE001
        print(f"Scrape failed: {exc}", file=sys.stderr)
        sys.exit(1)

    if not data["rankings"]:
        print("Scrape succeeded but found zero ranked teams - refusing to overwrite existing data.", file=sys.stderr)
        sys.exit(1)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(data['rankings'])} {DIVISION} teams to {OUTPUT_PATH}")
    print(f"Bid allocation: {data['bid_allocation']}")


if __name__ == "__main__":
    main()
