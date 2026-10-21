#!/usr/bin/env python3
"""
Build hrt-app/data/bigfamily-rooms.js from the Big Family Finder sheet.

Source of truth: Google Sheet "HRT Big Family Finder Catalog", tab "Site".

    python3 tools/build_bigfamily_rooms.py --url "<Site tab Publish to web CSV link>"
    python3 tools/build_bigfamily_rooms.py --csv Site.csv

Safety: if anything in the sheet breaks a rule, nothing is written and the
error names the row. If the number of rooms would drop below 80% of what the
site has now, nothing is written (a half-loaded sheet must never wipe the
site); to remove many rooms on purpose, add --allow-shrink.

Rules (same as the sheet's Read me tab):
  show yes|no (only yes reaches the site), destination hawaii|japan,
  place from the fixed list, sleeps a whole number 6 or more,
  beds real|shared|sofa|unknown|extra, program Hilton|Marriott|Hyatt|DVC|None,
  points_per_night blank or a whole number, official_url https,
  checked YYYY-MM-DD, no em or en dashes.
No secrets live in the sheet or this script. Safe for the public repo.
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "hrt-app" / "data" / "bigfamily-rooms.js"
POINTS_DATES = "Feb 16 to 19, 2027, 2 adults and 4 kids"

PLACES = {
    "hawaii": ["Oʻahu", "Maui", "Big Island", "Kauaʻi", "Lānaʻi"],
    "japan": ["Tokyo", "Osaka", "Kyoto", "Okinawa", "Hokkaido"],
}
BEDS = {"real", "shared", "sofa", "unknown", "extra"}
PROGRAMS = {"Hilton", "Marriott", "Hyatt", "DVC", "None"}
COLUMNS = ["show", "destination", "place", "area", "hotel", "room", "sleeps", "beds",
           "bedrooms", "kitchen", "program", "points_per_night", "official_url", "checked", "notes"]
URL_RE = re.compile(r"^https://[^\s\"'<>]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


class SheetError(Exception):
    pass


def norm(v):
    return str(v or "").strip().lstrip("'").strip()


def number(v, row, col):
    s = norm(v).replace(",", "")
    if s == "":
        return None
    if not re.fullmatch(r"\d+", s):
        raise SheetError(f"Site row {row}: {col} must be a whole number, got {v!r}")
    return int(s)


def parse(text):
    reader = csv.reader(io.StringIO(text))
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration:
        raise SheetError("Site tab is empty")
    missing = [c for c in COLUMNS[:14] if c not in header]
    if missing:
        raise SheetError("Site tab is missing columns: " + ", ".join(missing)
                         + ". Is the link for the Site tab? Got headers: " + ", ".join(header[:6]))
    idx = {c: header.index(c) for c in header if c}
    rooms, latest = [], ""
    for n, raw in enumerate(reader, start=2):
        if all(norm(v) == "" for v in raw):
            continue
        r = {c: (raw[i] if i < len(raw) else "") for c, i in idx.items()}
        show = norm(r["show"]).lower()
        if show not in ("yes", "no"):
            raise SheetError(f"Site row {n}: show must be yes or no, got {r['show']!r}")
        if show == "no":
            continue
        d = norm(r["destination"]).lower()
        if d not in PLACES:
            raise SheetError(f"Site row {n}: destination must be hawaii or japan, got {r['destination']!r}")
        p = norm(r["place"])
        if p not in PLACES[d]:
            raise SheetError(f"Site row {n}: place for {d} must be one of {', '.join(PLACES[d])}, got {p!r}")
        for col in ("area", "hotel", "room", "bedrooms", "kitchen"):
            if not norm(r[col]):
                raise SheetError(f"Site row {n}: {col} is blank")
        s = number(r["sleeps"], n, "sleeps")
        if s is None or s < 6 or s > 20:
            raise SheetError(f"Site row {n}: sleeps must be 6 to 20, got {r['sleeps']!r}")
        b = norm(r["beds"]).lower()
        if b not in BEDS:
            raise SheetError(f"Site row {n}: beds must be one of {', '.join(sorted(BEDS))}, got {r['beds']!r}")
        g = norm(r["program"])
        if g not in PROGRAMS:
            raise SheetError(f"Site row {n}: program must be one of {', '.join(sorted(PROGRAMS))}, got {g!r}")
        pts = number(r["points_per_night"], n, "points_per_night")
        if pts is not None and g not in ("Hilton", "Marriott", "Hyatt"):
            raise SheetError(f"Site row {n}: points_per_night is set but program is {g}")
        u = norm(r["official_url"])
        if not URL_RE.match(u):
            raise SheetError(f"Site row {n}: official_url must be an https link with no spaces, got {u!r}")
        c = norm(r["checked"])
        if not DATE_RE.match(c):
            raise SheetError(f"Site row {n}: checked must be a date like 2026-10-20, got {r['checked']!r}")
        latest = max(latest, c)
        item = {"d": d, "p": p, "a": norm(r["area"]), "n": norm(r["hotel"]), "r": norm(r["room"]),
                "s": s, "b": b, "br": norm(r["bedrooms"]), "k": norm(r["kitchen"]), "g": g,
                "pts": pts, "u": u}
        for k in ("a", "n", "r", "br", "k"):
            if "—" in item[k] or "–" in item[k]:
                raise SheetError(f"Site row {n}: no em or en dashes please (in {k})")
        rooms.append(item)
    if not rooms:
        raise SheetError("Site tab has no rows with show = yes")
    return rooms, latest


def label(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{MONTHS[m - 1]} {d}, {y}"


def current_count():
    if not OUT.exists():
        return 0
    return len(re.findall(r'\{"?d"?:', OUT.read_text(encoding="utf8")))


def render(rooms, latest):
    lines = [
        "/* Big Family Finder rooms. GENERATED by tools/build_bigfamily_rooms.py from the Google Sheet",
        "   \"HRT Big Family Finder Catalog\", tab Site. Edit the sheet, not this file.",
        "   Fields: d destination, p island or city, a area, n hotel, r room, s max guests,",
        "   b beds (real | shared | sofa | unknown | extra), br bedrooms, k kitchen,",
        "   g program, pts points per night on sample dates (null = not checked), u official page. */",
        "window.HRT_BIGFAM_CHECKED = " + json.dumps(label(latest), ensure_ascii=False) + ";",
        "window.HRT_BIGFAM_POINTS_DATES = " + json.dumps(POINTS_DATES) + ";",
        "window.HRT_BIGFAM_ROOMS = [",
    ]
    body = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rooms]
    lines.append(",\n".join("  " + b for b in body))
    lines.append("];")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="Site tab Publish to web CSV link")
    src.add_argument("--csv", help="a downloaded Site.csv")
    ap.add_argument("--allow-shrink", action="store_true")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args(argv)
    try:
        if a.url:
            with urllib.request.urlopen(a.url, timeout=60) as resp:
                text = resp.read().decode("utf-8-sig")
        else:
            text = Path(a.csv).read_text(encoding="utf-8-sig")
        rooms, latest = parse(text)
        before = current_count()
        if before and len(rooms) < 0.8 * before and not a.allow_shrink:
            raise SheetError(f"Site would drop from {before} to {len(rooms)} rooms. "
                             "If that is on purpose, run with --allow-shrink.")
    except (SheetError, OSError) as e:
        print("REFUSED, nothing written: " + str(e), file=sys.stderr)
        return 1
    Path(a.out).write_text(render(rooms, latest), encoding="utf8")
    print(f"Wrote {len(rooms)} rooms to {a.out} (checked {latest})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
