"""Regenerate src/assets/czechia-districts.ts from the geoBoundaries release.

The cartogram map needs one SVG path per Czech district, and the app must
never fetch geometry at runtime, so the outlines are baked into a TypeScript
module that Vite bundles. This script is the build time step: it reads the
downloaded GeoJSON, projects it onto a flat map, simplifies it with
Douglas Peucker, rounds it onto an integer grid, and writes the module.

Source (public domain, fetched once when the geometry was committed):

  https://www.geoboundaries.org/api/current/gbOpen/CZE/ADM2/
  https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/CZE/ADM2/geoBoundaries-CZE-ADM2_simplified.geojson

Download it with curl, then run:

  python3 scripts/map/build_district_geometry.py cze-adm2-simplified.geojson

The name rules live in src/lib/districtNames.ts, and
src/lib/districtNames.test.ts pins the join against data/tangerine/districts.csv,
so a regeneration that loses a district fails the TypeScript suite.
"""

from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("cze-adm2-simplified.geojson")
DEFAULT_OUTPUT = REPO / "src" / "assets" / "czechia-districts.ts"

# Douglas Peucker tolerance in projected degrees. At the shipped scale one
# unit of the 1000 wide viewBox is under a pixel, and 0.0025 degrees is
# roughly half a pixel, so the simplification is invisible on screen.
TOLERANCE = 0.0025

VIEW_WIDTH = 1000
BORDER = 6.0

# geoBoundaries spells nine city and direction units in English while
# data/tangerine/districts.csv spells them in Czech. Keyed by the
# normalized English form, mirroring ENGLISH_ALIASES in districtNames.ts.
ALIASES = {
    "prague": "praha",
    "prague east": "praha vychod",
    "prague west": "praha zapad",
    "plzen city": "plzen mesto",
    "plzen north": "plzen sever",
    "plzen south": "plzen jih",
    "brno city": "brno mesto",
    "brno country": "brno venkov",
    "ostrava city": "ostrava mesto",
}

CAPITAL_PREFIXES = {"hl", "hlavni", "mesto", "m"}


def rings_of(geometry: dict) -> list:
    """Every ring of a Polygon or MultiPolygon feature."""
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    rings: list = []
    for polygon in geometry["coordinates"]:
        rings.extend(polygon)
    return rings


def project(lon: float, lat: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Equirectangular with a cosine correction, y pointing down."""
    return ((lon - lon0) * math.cos(math.radians(lat0)), -lat)


def simplify(points: list, tolerance: float) -> list:
    """Iterative Douglas Peucker over a closed ring (first point repeated)."""
    if len(points) < 5:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    tolerance_sq = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        best = -1.0
        best_index = -1
        for index in range(start + 1, end):
            px, py = points[index]
            if norm == 0:
                distance = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / norm
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                distance = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
            if distance > best:
                best = distance
                best_index = index
        if best > tolerance_sq and best_index > 0:
            keep[best_index] = True
            stack.append((start, best_index))
            stack.append((best_index, end))
    return [point for point, flagged in zip(points, keep) if flagged]


def district_key(name: str) -> str:
    """The same join key src/lib/districtNames.ts produces."""
    plain = "".join(
        character
        for character in unicodedata.normalize("NFD", name)
        if not unicodedata.combining(character)
    )
    tokens = re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip().split()
    start = 0
    while start < len(tokens) - 1 and tokens[start] in CAPITAL_PREFIXES:
        start += 1
    key = " ".join("nad" if token == "n" else token for token in tokens[start:])
    return ALIASES.get(key, key)


def main() -> None:
    document = json.loads(DEFAULT_INPUT.read_text(encoding="utf-8"))

    latitudes: list[float] = []
    longitudes: list[float] = []
    for feature in document["features"]:
        for ring in rings_of(feature["geometry"]):
            for lon, lat in ring:
                longitudes.append(lon)
                latitudes.append(lat)
    lat0 = (min(latitudes) + max(latitudes)) / 2
    lon0 = (min(longitudes) + max(longitudes)) / 2

    projected: list[tuple[str, list[list[tuple[float, float]]]]] = []
    for feature in document["features"]:
        shape: list[list[tuple[float, float]]] = []
        for ring in rings_of(feature["geometry"]):
            points = [project(lon, lat, lat0, lon0) for lon, lat in ring]
            points = simplify(points, TOLERANCE)
            if len(points) >= 4:
                shape.append(points)
        projected.append((feature["properties"]["shapeName"], shape))

    xs = [x for _, shape in projected for ring in shape for x, _ in ring]
    ys = [y for _, shape in projected for ring in shape for _, y in ring]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    span_x = max_x - min_x
    span_y = max_y - min_y
    height = round(VIEW_WIDTH * span_y / span_x)
    scale = (VIEW_WIDTH - 2 * BORDER) / span_x

    def emit(ring: list[tuple[float, float]]) -> str:
        steps = [
            f"{round((x - min_x) * scale + BORDER)} {round((y - min_y) * scale + BORDER)}"
            for x, y in ring
        ]
        return "M" + "L".join(steps) + "Z"

    rows: list[tuple[str, str]] = []
    points_total = 0
    for name, shape in projected:
        path = "".join(emit(ring) for ring in shape)
        points_total += sum(len(ring) for ring in shape)
        rows.append((district_key(name), path))

    keys = [key for key, _ in rows]
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    if duplicates:
        raise SystemExit(f"duplicate normalized keys: {duplicates}")

    body = "\n".join(f"  {{ name: '{key}', path: '{path}' }}," for key, path in rows)
    module = f"""/**
 * Simplified district geometry for the cartogram map, written by
 * scripts/map/build_district_geometry.py from geoBoundaries gbOpen
 * CZE ADM2 (Public Domain, www.geoboundaries.org, 77 districts). The
 * outlines are projected to a flat map, simplified with Douglas
 * Peucker, and rounded onto a 1000 by {height} integer grid so the map
 * keeps the same chunky pixel edge the rest of the station wears.
 * Names are normalized keys, the same shape src/lib/districtNames.ts
 * produces, so the cartogram joins a districts.csv row to its outline
 * with no network at runtime.
 */

/** The viewBox every path in this file is drawn on. */
export const CZECHIA_VIEW_BOX = '0 0 1000 {height}'

/** One district outline under its normalized name. */
export interface DistrictGeometry {{
  /** Normalized district name, the join key. */
  name: string
  /** SVG path data on CZECHIA_VIEW_BOX. */
  path: string
}}

/** All 77 districts, one path each. */
export const CZECHIA_DISTRICTS: readonly DistrictGeometry[] = [
{body}
]

/** Guard against a truncated or overgrown asset. */
export const CZECHIA_DISTRICT_COUNT = {len(rows)}
"""
    DEFAULT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_OUTPUT.write_text(module, encoding="utf-8")
    print(
        f"wrote {DEFAULT_OUTPUT.relative_to(REPO)}: {len(rows)} districts, "
        f"{points_total} points, {len(module)} bytes"
    )


if __name__ == "__main__":
    main()
