#!/usr/bin/env python3
"""Génère la migration de données du référentiel des communes (geo.api.gouv.fr).

Usage : python3 supabase/scripts/generate_cities_migration.py supabase/migrations/<horodatage>_cities_referentiel.sql

Sans dépendance (stdlib). Sortie déterministe (tri par code INSEE) pour des diffs lisibles.
Le référentiel évolue (fusions/créations de communes) : pour le rafraîchir, relancer ce script
et en faire une NOUVELLE migration d'upsert (ne jamais réécrire une migration déjà appliquée).
"""
import json
import re
import sys
import urllib.request
from datetime import date

URL = "https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre,population&format=json"
BATCH = 500


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with urllib.request.urlopen(URL, timeout=120) as resp:
        communes = json.load(resp)

    rows, skipped = [], 0
    for c in sorted(communes, key=lambda c: c["code"]):
        code, name = c.get("code", ""), (c.get("nom") or "").strip()
        centre = (c.get("centre") or {}).get("coordinates")
        postal = sorted({p for p in c.get("codesPostaux", []) if re.fullmatch(r"[0-9]{5}", p)})
        if not re.fullmatch(r"[0-9]{5}|2[AB][0-9]{3}", code) or not name or len(name) > 100 or not centre:
            skipped += 1
            continue
        lon, lat = centre
        pop = c.get("population")
        pop_sql = str(int(pop)) if isinstance(pop, int) and pop >= 0 else "null"
        arr = "'{" + ",".join(postal) + "}'"
        rows.append(f"({sql_str(code)},{sql_str(name)},{arr},{pop_sql},'SRID=4326;POINT({lon:.6f} {lat:.6f})')")

    out = [
        f"-- Référentiel des communes françaises (geo.api.gouv.fr), généré le {date.today().isoformat()} : {len(rows)} communes.",
        "-- Généré par supabase/scripts/generate_cities_migration.py ; ne pas éditer à la main.",
        "-- Pour rafraîchir (fusions de communes...) : nouvelle migration d'upsert, jamais de modification de celle-ci.",
    ]
    for i in range(0, len(rows), BATCH):
        out.append("insert into public.cities (insee_code, name, postal_codes, population, location) values")
        out.append(",\n".join(rows[i : i + BATCH]))
        out.append("on conflict (insee_code) do nothing;")
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"{len(rows)} communes écrites ({skipped} ignorées sans centre/code valide)")


if __name__ == "__main__":
    main()
