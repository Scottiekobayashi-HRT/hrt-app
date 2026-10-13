#!/usr/bin/env python3
"""
Build hrt-app/data/wallet-catalog.js from the My Wallet card catalog sheet.

Source of truth: the Google Sheet "HRT-My-Wallet-card-catalog".
Download it as Excel (File > Download > Microsoft Excel), then run:

    python3 tools/build_wallet_catalog.py ~/Downloads/HRT-My-Wallet-card-catalog.xlsx

It refuses to write anything if the sheet has a problem, and says which row.

Rules it enforces (from the sheet's Read me tab):
  - card_id is unique and matches on both tabs
  - cadence and resets use the agreed words only
  - benefits marked "unverified" never reach members, so they are dropped here
No secrets live in the sheet or this script. Safe for the public repo.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Needs openpyxl:  pip3 install openpyxl")

OUT = Path(__file__).resolve().parent.parent / "hrt-app" / "data" / "wallet-catalog.js"

CADENCES = {"monthly", "quarterly", "semiannual", "annual", "every4years", "per event"}
RESETS = {"calendar", "anniversary", "unclear", "application date"}
CONFIDENCE = {"confirmed", "assumed", "unverified"}
UNITS = {"usd", "points", "passes", "certificates"}
FEE_BASIS = {"anniversary", "n/a"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class SheetError(Exception):
    pass


def rows(ws):
    """Yield (row_number, dict) for each non-empty row under the header row."""
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(it)]
    for n, raw in enumerate(it, start=2):
        if all(v is None or str(v).strip() == "" for v in raw):
            continue
        yield n, {h: ("" if v is None else v) for h, v in zip(header, raw) if h}


def text(v):
    if isinstance(v, (date,)):
        return v.isoformat()[:10]
    return str(v).strip()


def money(v, where):
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = text(v).replace("$", "").replace(",", "")
    try:
        return round(float(s), 2)
    except ValueError:
        raise SheetError(f"{where}: '{v}' is not a dollar amount")


def number(v, where):
    if isinstance(v, (int, float)):
        return float(v)
    s = text(v).replace(",", "").replace("$", "")
    try:
        return float(s)
    except ValueError:
        raise SheetError(f"{where}: '{v}' is not a number")


def checked_date(v, where):
    s = text(v)
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        raise SheetError(f"{where}: checked date '{v}' should look like 2026-10-13")
    return s


def build_cards(ws):
    cards, seen = [], set()
    for n, r in rows(ws):
        where = f"Cards row {n}"
        cid = text(r.get("card_id", ""))
        if not ID_RE.match(cid):
            raise SheetError(f"{where}: card_id '{cid}' must be lowercase-with-dashes")
        if cid in seen:
            raise SheetError(f"{where}: card_id '{cid}' appears twice")
        seen.add(cid)
        basis = text(r.get("fee_basis", "")).lower()
        if basis not in FEE_BASIS:
            raise SheetError(f"{where}: fee_basis '{basis}' must be one of {sorted(FEE_BASIS)}")
        name = text(r.get("card_name", ""))
        if not name:
            raise SheetError(f"{where}: card_name is empty")
        cards.append({
            "id": cid,
            "issuer": text(r.get("issuer", "")),
            "name": name,
            "network": text(r.get("network", "")),
            "fee": money(r.get("annual_fee", ""), where),
            "feeBasis": basis,
            "note": text(r.get("notes", "")),
            "source": text(r.get("source_url", "")),
            "checked": checked_date(r.get("checked", ""), where),
        })
    if not cards:
        raise SheetError("Cards tab has no cards")
    return cards


def build_benefits(ws, card_ids):
    out, dropped, seen = [], 0, set()
    for n, r in rows(ws):
        where = f"Benefits row {n}"
        cid = text(r.get("card_id", ""))
        if cid not in card_ids:
            raise SheetError(f"{where}: card_id '{cid}' is not on the Cards tab")
        bid = text(r.get("benefit_id", ""))
        if not ID_RE.match(bid):
            raise SheetError(f"{where}: benefit_id '{bid}' must be lowercase-with-dashes")
        if (cid, bid) in seen:
            raise SheetError(f"{where}: {cid}/{bid} appears twice")
        seen.add((cid, bid))
        conf = text(r.get("confidence", "")).lower()
        if conf not in CONFIDENCE:
            raise SheetError(f"{where}: confidence '{conf}' must be one of {sorted(CONFIDENCE)}")
        if conf == "unverified":
            dropped += 1
            continue
        cadence = text(r.get("cadence", "")).lower()
        if cadence not in CADENCES:
            raise SheetError(f"{where}: cadence '{cadence}' must be one of {sorted(CADENCES)}")
        resets = text(r.get("resets", "")).lower()
        if resets not in RESETS:
            raise SheetError(f"{where}: resets '{resets}' must be one of {sorted(RESETS)}")
        unit = text(r.get("unit", "")).lower()
        if unit not in UNITS:
            raise SheetError(f"{where}: unit '{unit}' must be one of {sorted(UNITS)}")
        amt = r.get("amount_per_period", "")
        out.append({
            "card": cid,
            "id": bid,
            "label": text(r.get("label", "")),
            "type": text(r.get("type", "")),
            "unit": unit,
            "amount": money(amt, where) if unit == "usd" else number(amt, where),
            "perYear": number(r.get("periods_per_year", ""), where),
            "cadence": cadence,
            "resets": resets,
            "enroll": text(r.get("enrollment", "")).lower(),
            "spendGate": text(r.get("spend_gate", "")),
            "confidence": conf,
            "note": text(r.get("note", "")),
            "source": text(r.get("source_url", "")),
            "checked": checked_date(r.get("checked", ""), where),
        })
    return out, dropped


def no_em_dashes(obj):
    """House style: no em or en dashes reach members."""
    s = json.dumps(obj, ensure_ascii=False)
    if "—" in s or "–" in s:
        raise SheetError("A dash (em or en) is in the sheet text. House style says none in member-facing text.")


def main(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    if "Cards" not in wb.sheetnames:
        raise SheetError(f"No 'Cards' tab. Tabs found: {wb.sheetnames}")
    cards = build_cards(wb["Cards"])
    ids = {c["id"] for c in cards}
    benefits, dropped = ([], 0)
    if "Benefits" in wb.sheetnames:
        benefits, dropped = build_benefits(wb["Benefits"], ids)
    catalog = {"v": 1, "built": date.today().isoformat(), "cards": cards, "benefits": benefits}
    no_em_dashes(catalog)
    body = json.dumps(catalog, ensure_ascii=False, indent=1)
    OUT.write_text(
        "/* GENERATED by tools/build_wallet_catalog.py from the My Wallet card catalog sheet.\n"
        "   Do not hand-edit. Change the sheet, download it, run the script. */\n"
        f"window.HRT_WALLET_CATALOG={body};\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT.relative_to(OUT.parent.parent.parent)}: "
          f"{len(cards)} cards, {len(benefits)} benefits, {dropped} unverified benefits left out.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    try:
        main(sys.argv[1])
    except SheetError as e:
        sys.exit(f"Not written. {e}")
