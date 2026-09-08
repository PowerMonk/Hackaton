#!/usr/bin/env python3
"""Extrae las rutas de combis/camiones de Morelia desde OpenStreetMap.

Fuente: Overpass API (datos OSM, licencia ODbL -> atribuir si se republican).
Salida:
  - rutas.geojson           FeatureCollection (una Feature por ruta)
  - paradas.geojson         FeatureCollection de puntos de parada
  - rutas_liviano.geojson   version simplificada (~13 m) para web
  - paradas_liviano.geojson idem
  - reporte_sin_nombre.csv  reporte de relaciones sin nombre en OSM

Clasificacion de relaciones sin 'ref'/'name' (por solape de ways con las
rutas nombradas):
  - DUP_ABOVE:   >=97% en ambas direcciones  -> duplicado, se descarta
  - MERGE_ABOVE: >=80% en alguna direccion   -> subconjunto, se fusiona como
                variante de la ruta nombrada
  - resto: route unica -> placeholder "Sin nombre -- <coloniaA> <-> <coloniaB>"

Uso:
    python3 extract_morelia.py
"""
import csv
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

BBOX = (19.6000, -101.3500, 19.7700, -101.0500)  # sur, oeste, norte, este
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

DUP_ABOVE = 0.97
MERGE_ABOVE = 0.80

PLACE_TYPES = "^(suburb|neighbourhood|quarter|city_block|village|town|hamlet)$"


def overpass_query(query, timeout=280):
    data = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(
                ep, data=data, headers={"User-Agent": "morelia-rutas-extractor/1.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except Exception as exc:  # noqa: BLE001 - probar siguiente mirror
            last_err = exc
            print(f"  aviso: {ep} fallo ({exc}); reintentando...", file=sys.stderr)
            time.sleep(2)
    raise RuntimeError(f"Overpass no disponible en ningun mirror: {last_err}")


def build_query(s, w, n, e):
    bbox = f"({s:.4f},{w:.4f},{n:.4f},{e:.4f})"
    return f"""
[out:json][timeout:240];
relation["route"="bus"]{bbox}->.r;
way(r.r)->.rw;
node(w.rw)->.wn;
way["place"~"^(neighbourhood|suburb)$"]["name"]{bbox}->.plw;
(
  .r;
  .rw;
  .wn;
  node(r.r:"stop");
  node(r.r:"platform");
  way(r.r:"platform");
  node["highway"="bus_stop"]{bbox};
  node["place"~"{PLACE_TYPES}"]["name"]{bbox};
  .plw;
  node(w.plw);
);
out body;
"""


def repair_encoding(s):
    if s is None:
        return s
    replacements = [
        ("\u00c3\u00a1", "\u00e1"),  # Ã¡ -> á
        ("\u00c3\u00a9", "\u00e9"),  # Ã© -> é
        ("\u00c3\u00ad", "\u00ed"),  # Ã­ -> í
        ("\u00c3\u00b3", "\u00f3"),  # Ã³ -> ó
        ("\u00c3\u00ba", "\u00fa"),  # Ãº -> ú
        ("\u00c3\u00b1", "\u00f1"),  # Ã± -> ñ
        ("\u00c3\u00bc", "\u00fc"),  # Ã¼ -> ü
        ("\u00c2\u00b0", "\u00b0"),  # Â° -> °
        ("\u00c2\u00bf", "\u00bf"),  # Â¿ -> ¿
        ("\u00c2\u00a1", "\u00a1"),  # Â¡ -> ¡
    ]
    for bad, good in replacements:
        s = s.replace(bad, good)
    return s


def element_index(elements):
    return {(el["type"], el["id"]): el for el in elements}


def node_coords(idx, node_ref):
    el = idx.get(("node", node_ref))
    if el is None or "lat" not in el:
        return None
    return [el["lon"], el["lat"]]


def relation_segments(idx, rel):
    segments = []
    current = []
    for m in rel.get("members", []):
        if m["type"] != "way" or m.get("role", "") not in ("", "forward", "backward"):
            continue
        way = idx.get(("way", m["ref"]))
        if way is None or "nodes" not in way:
            continue
        refs = way["nodes"]
        if m.get("role") == "backward":
            refs = list(reversed(refs))
        pts = [node_coords(idx, r) for r in refs]
        pts = [p for p in pts if p]
        if len(pts) < 2:
            continue
        if current and pts[0] != current[-1]:
            segments.append(current)
            current = []
        current.extend(pts)
    if len(current) >= 2:
        segments.append(current)
    return segments


def relation_stops(idx, rel):
    stops = []
    for m in rel.get("members", []):
        if m.get("role", "") not in ("stop", "platform"):
            continue
        if m["type"] == "node":
            coords = node_coords(idx, m["ref"])
            if coords:
                stops.append(coords)
        elif m["type"] == "way":
            way = idx.get(("way", m["ref"]))
            if way is None or "nodes" not in way:
                continue
            pts = [node_coords(idx, r) for r in way["nodes"]]
            pts = [p for p in pts if p]
            if pts:
                stops.append([
                    sum(p[0] for p in pts) / len(pts),
                    sum(p[1] for p in pts) / len(pts),
                ])
    return stops


def relation_ways(rel):
    return frozenset(
        m["ref"]
        for m in rel.get("members", [])
        if m["type"] == "way" and m.get("role", "") in ("", "forward", "backward")
    )


def build_places(elements):
    idx = {(el["type"], el["id"]): el for el in elements}
    points = []
    seen = set()
    for el in elements:
        if el["type"] != "node" or "lat" not in el:
            continue
        nm = el.get("tags", {}).get("name")
        if nm and el.get("tags", {}).get("place"):
            k = (round(el["lon"], 5), round(el["lat"], 5))
            if k not in seen:
                seen.add(k)
                points.append([el["lon"], el["lat"], repair_encoding(nm)])
    for el in elements:
        if el["type"] != "way":
            continue
        nm = el.get("tags", {}).get("name")
        if not (nm and el.get("tags", {}).get("place")):
            continue
        xs, ys = [], []
        for rid in el.get("nodes", []):
            nn = idx.get(("node", rid))
            if nn and "lat" in nn:
                xs.append(nn["lon"])
                ys.append(nn["lat"])
        if xs:
            lon, lat = sum(xs) / len(xs), sum(ys) / len(ys)
            k = (round(lon, 5), round(lat, 5))
            if k not in seen:
                seen.add(k)
                points.append([lon, lat, repair_encoding(nm)])
    return points


def nearest_place(places, lon, lat):
    best, bname = None, None
    for plon, plat, nm in places:
        d = math.hypot(lon - plon, lat - plat)
        if best is None or d < best:
            best, bname = d, nm
    return bname


def seg_endpoints(segments):
    if not segments:
        return None, None
    return segments[0][0], segments[-1][-1]


def fmt_pt(p):
    if p is None:
        return ""
    return f"{p[0]:.5f},{p[1]:.5f}"


def unique_name(base, taken):
    if base not in taken:
        taken.add(base)
        return base
    i = 2
    while f"{base} ({i})" in taken:
        i += 1
    taken.add(f"{base} ({i})")
    return f"{base} ({i})"


def dedup_segments(existing, new_segs):
    seen = set()
    for seg in existing:
        k = tuple((round(p[0], 7), round(p[1], 7)) for p in seg)
        seen.add(k)
        seen.add(tuple(reversed(k)))
    out = []
    for seg in new_segs:
        k = tuple((round(p[0], 7), round(p[1], 7)) for p in seg)
        if k in seen:
            continue
        seen.add(k)
        seen.add(tuple(reversed(k)))
        out.append(seg)
    return out


def feature_geom(segments):
    if len(segments) == 1:
        return {"type": "LineString", "coordinates": segments[0]}
    return {"type": "MultiLineString", "coordinates": segments}


def simplify(pts, tol=1.2e-4):
    if len(pts) < 3:
        return pts
    def perp(a, b, p):
        dx, dy = b[0] - a[0], b[1] - a[1]
        ex, ey = b[1] - a[1], -(b[0] - a[0])
        if abs(ex) + abs(ey) == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        num = (p[0] - a[0]) * ex + (p[1] - a[1]) * ey
        den = math.hypot(ex, ey)
        return abs(num) / den
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp(pts[0], pts[-1], pts[i])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        left = simplify(pts[: idx + 1], tol)
        right = simplify(pts[idx:], tol)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def write_geojson(path, fc):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))


def main():
    s, w, n, e = BBOX
    print(f"Descargando rutas de Morelia bbox=({s},{w},{n},{e})...")
    raw = overpass_query(build_query(s, w, n, e))
    elements = raw.get("elements", [])
    idx = element_index(elements)
    print(f"  elementos OSM descargados: {len(elements)}")
    places = build_places(elements)
    print(f"  lugares de referencia para nombres: {len(places)}")

    rels = [el for el in elements if el["type"] == "relation"]
    print(f"  relaciones de ruta (variantes): {len(rels)}")

    named = {}
    unnamed = []
    for rel in rels:
        segments = relation_segments(idx, rel)
        if sum(len(x) for x in segments) < 2:
            continue
        tags = rel.get("tags", {})
        key = None
        for k in ("ref", "name"):
            v = repair_encoding(tags.get(k))
            if v:
                key = v.strip()
                break
        info = {
            "id": rel["id"],
            "segments": segments,
            "stops": relation_stops(idx, rel),
            "ways": relation_ways(rel),
        }
        if key:
            entry = named.setdefault(
                key, {"key": key, "ids": [], "segments": [], "stops": [], "ways": set()}
            )
            entry["ids"].append(rel["id"])
            entry["segments"].extend(segments)
            entry["stops"].extend(info["stops"])
            entry["ways"] |= set(info["ways"])
        else:
            unnamed.append(info)

    report = []
    merged_unnamed = 0
    dropped_unnamed = 0
    kept_unnamed = []
    taken_names = set(named.keys())
    for u in unnamed:
        w = u["ways"]
        best = None
        for key, entry in named.items():
            inter = len(w & entry["ways"])
            if inter == 0:
                continue
            c1 = inter / len(w)
            c2 = inter / len(entry["ways"])
            score = c1 * c2
            if best is None or score > best[0]:
                best = (score, c1, c2, key)
        a_pt, b_pt = seg_endpoints(u["segments"])
        a_place = nearest_place(places, *a_pt) if a_pt else None
        b_place = nearest_place(places, *b_pt) if b_pt else None
        row = {
            "relation_id": u["id"],
            "tipo": "",
            "nombre_detectado": "",
            "cobertura_percent": "",
            "colonia_extremo_A": a_place or "",
            "colonia_extremo_B": b_place or "",
            "lonlat_extremo_A": fmt_pt(a_pt) if a_pt else "",
            "lonlat_extremo_B": fmt_pt(b_pt) if b_pt else "",
            "n_ways": len(w),
            "nombre_real": "",
        }
        if best:
            score, c1, c2, key = best
            if c1 >= DUP_ABOVE and c2 >= DUP_ABOVE:
                row.update(
                    tipo="duplicado",
                    nombre_detectado=key,
                    cobertura_percent=f"{c1*100:.0f}/{c2*100:.0f}",
                )
                report.append(row)
                dropped_unnamed += 1
                continue
            if c1 >= MERGE_ABOVE or c2 >= MERGE_ABOVE:
                row.update(
                    tipo="subconjunto",
                    nombre_detectado=key,
                    cobertura_percent=f"{c1*100:.0f}/{c2*100:.0f}",
                )
                report.append(row)
                entry = named[key]
                entry["ids"].append(u["id"])
                entry["segments"].extend(dedup_segments(entry["segments"], u["segments"]))
                entry["stops"].extend(u["stops"])
                merged_unnamed += 1
                continue
        row["tipo"] = "unica"
        base = "Sin nombre"
        if a_place or b_place:
            if a_place and b_place and a_place != b_place:
                base = f"Sin nombre — {a_place} ↔ {b_place}"
            elif a_place:
                base = f"Sin nombre — Zona {a_place}"
            elif b_place:
                base = f"Sin nombre — Zona {b_place}"
        row["nombre_detectado"] = base
        report.append(row)
        u["nombre"] = unique_name(base, taken_names)
        kept_unnamed.append(u)

    routes_fc = {
        "type": "FeatureCollection",
        "name": "rutas-combis-camiones-morelia",
        "features": [],
    }
    for key, entry in sorted(named.items(), key=lambda kv: kv[0].lower()):
        routes_fc["features"].append({
            "type": "Feature",
            "id": key,
            "properties": {
                "ref": key,
                "nombre": key,
                "variantes": len(entry["ids"]),
                "osmid": entry["ids"][0],
                "paradas": len(entry["stops"]),
                "sin_nombre": False,
            },
            "geometry": feature_geom(entry["segments"]),
        })
    for u in kept_unnamed:
        routes_fc["features"].append({
            "type": "Feature",
            "id": u["nombre"],
            "properties": {
                "ref": u["nombre"],
                "nombre": u["nombre"],
                "variantes": 1,
                "osmid": u["id"],
                "paradas": len(u["stops"]),
                "sin_nombre": True,
            },
            "geometry": feature_geom(u["segments"]),
        })

    master_stops = {}
    all_entries = [(e["key"], e["stops"]) for e in named.values()] + [
        (u["nombre"], u["stops"]) for u in kept_unnamed
    ]
    for key, stops in all_entries:
        for c in stops:
            k = (round(c[0], 6), round(c[1], 6))
            master_stops.setdefault(k, {"name": None, "routes": set()})["routes"].add(key)
    for el in elements:
        if el["type"] != "node" or "lat" not in el:
            continue
        tags = el.get("tags", {})
        if not (
            tags.get("highway") == "bus_stop"
            or tags.get("public_transport") in ("platform", "stop_position")
        ):
            continue
        nm = repair_encoding(tags.get("name"))
        k = (round(el["lon"], 6), round(el["lat"], 6))
        if k not in master_stops:
            master_stops[k] = {"name": nm, "routes": set()}
        elif nm and not master_stops[k]["name"]:
            master_stops[k]["name"] = nm

    stops_fc = {
        "type": "FeatureCollection",
        "name": "paradas-morelia",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "nombre": info["name"],
                    "rutas": sorted(info["routes"]),
                },
                "geometry": {"type": "Point", "coordinates": k},
            }
            for k, info in sorted(master_stops.items())
        ],
    }

    ruta_path = os.path.join(OUT_DIR, "rutas.geojson")
    parada_path = os.path.join(OUT_DIR, "paradas.geojson")
    write_geojson(ruta_path, routes_fc)
    write_geojson(parada_path, stops_fc)

    livianas = []
    for f in routes_fc["features"]:
        g = f["geometry"]
        segs = (
            [g["coordinates"]]
            if g["type"] == "LineString"
            else g["coordinates"]
        )
        sim = [simplify(seg) for seg in segs if len(seg) >= 2]
        f = dict(f)
        f["geometry"] = feature_geom(sim)
        livianas.append(f)
    liviana_fc = {"type": "FeatureCollection", "features": livianas}
    write_geojson(os.path.join(OUT_DIR, "rutas_liviano.geojson"), liviana_fc)
    write_geojson(os.path.join(OUT_DIR, "paradas_liviano.geojson"), stops_fc)

    csv_path = os.path.join(OUT_DIR, "reporte_sin_nombre.csv")
    cols = [
        "relation_id", "tipo", "nombre_detectado", "cobertura_percent",
        "colonia_extremo_A", "colonia_extremo_B", "lonlat_extremo_A",
        "lonlat_extremo_B", "n_ways", "nombre_real",
    ]
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        wcsv = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        wcsv.writeheader()
        wcsv.writerows(sorted(report, key=lambda r: (-1 if r["tipo"] == "unica" else 0, r["relation_id"])))

    n_named = sum(len(e["ids"]) for e in named.values())
    print(f"\nResumen:")
    print(f"  rutas con nombre (features): {len(named)}   (variantes={n_named} + {merged_unnamed} fusionadas)")
    print(f"  sin nombre en OSM -> duplicados descartados: {dropped_unnamed}")
    print(f"  sin nombre en OSM -> subconjuntos fusionados: {merged_unnamed}")
    print(f"  rutas unicas placeholder: {len(kept_unnamed)}")
    print(f"  paradas: {len(stops_fc['features'])}")
    print(f"  -> {ruta_path} ({os.path.getsize(ruta_path)/1e6:.1f} MB)")
    print(f"  -> {os.path.join(OUT_DIR,'rutas_liviano.geojson')} ({os.path.getsize(os.path.join(OUT_DIR,'rutas_liviano.geojson'))/1e6:.1f} MB)")
    print(f"  -> {csv_path}")


if __name__ == "__main__":
    main()