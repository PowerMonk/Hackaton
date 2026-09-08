import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:latlong2/latlong.dart';

import '../models/app_models.dart';
import 'demo_data.dart';

/// Carga las 12 rutas curadas de OSM desde assets locales.
///
/// Fuente: `morelia-rutas/rutas_liviano.geojson` (ODbL, © OSM contribuidores),
/// recortada a `assets/geojson/rutas_demo.geojson` (~50KB).
/// En v0.1 todo es local y estimado; el backend Bun/PostGIS (ver context.md)
/// reemplazará esta clase sin cambiar la UI.
class RoutesRepository {
  RoutesRepository._();

  static const _rutasAsset = 'assets/geojson/rutas_demo.geojson';
  static const _paradasAsset = 'assets/geojson/paradas_demo.geojson';

  static const _palette = <Color>[
    Color(0xFFC94C28), // terracota
    Color(0xFF158D8E), // teal
    Color(0xFF294975), // navy
    Color(0xFFD29A14), // ámbar
    Color(0xFF6C4AB6),
    Color(0xFF2E7D32),
  ];

  /// Carga rutas reales; si falla (p.ej. en tests sin assets), cae a [demoRoutes].
  static Future<List<TransitRoute>> loadDemoRoutes() async {
    try {
      final raw = await rootBundle.loadString(_rutasAsset);
      final fc = json.decode(raw) as Map<String, dynamic>;
      final features = (fc['features'] as List).cast<Map<String, dynamic>>();
      final routes = <TransitRoute>[];
      var i = 0;
      for (final f in features) {
        i++;
        final props = (f['properties'] as Map).cast<String, dynamic>();
        final nombre = (props['nombre'] ?? props['ref'] ?? 'Ruta $i') as String;
        final geom = (f['geometry'] as Map).cast<String, dynamic>();
        final poly = _flattenGeometry(geom);
        if (poly.length < 2) continue;
        routes.add(
          TransitRoute(
            id: 'R${i.toString().padLeft(2, '0')}',
            name: nombre,
            mode: _inferMode(nombre),
            frequency: 'Estimado · cada ~10 min',
            eta: '—',
            color: _palette[(i - 1) % _palette.length],
            status: RouteStatus.active,
            sharedSegment: (props['variantes'] as num?) != null &&
                    (props['variantes'] as num) > 1
                ? '${props['variantes']} variantes en OSM'
                : null,
            polyline: poly,
            fuente: 'osm-demo',
            esEstimado: true,
            paradasCount: (props['paradas'] as num?)?.toInt() ?? 0,
          ),
        );
      }
      routes.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      if (routes.isEmpty) return demoRoutes;
      return routes;
    } catch (_) {
      return demoRoutes;
    }
  }

  /// Paradas cercanas a una ruta (≤[maxMeters]), ordenadas por progreso.
  static Future<List<StopInfo>> stopsFor(
    TransitRoute route, {
    double maxMeters = 350,
  }) async {
    if (!route.tieneGeometriaReal) return demoStops;
    try {
      final raw = await rootBundle.loadString(_paradasAsset);
      final fc = json.decode(raw) as Map<String, dynamic>;
      final features = (fc['features'] as List).cast<Map<String, dynamic>>();
      const dist = Distance();
      final scored = <_ScoredStop>[];
      for (final f in features) {
        final geom = (f['geometry'] as Map).cast<String, dynamic>();
        final coords = (geom['coordinates'] as List).cast<num>();
        final pt = LatLng(coords[1].toDouble(), coords[0].toDouble());
        var best = double.infinity;
        var bestIdx = 0;
        for (var k = 0; k < route.polyline!.length; k++) {
          final d = dist(route.polyline![k], pt);
          if (d < best) {
            best = d;
            bestIdx = k;
          }
        }
        if (best <= maxMeters) {
          final props = (f['properties'] as Map).cast<String, dynamic>();
          final nombre = (props['nombre'] as String?) ?? '(parada sin nombre)';
          scored.add(_ScoredStop(nombre: nombre, index: bestIdx));
        }
      }
      scored.sort((a, b) => a.index.compareTo(b.index));
      if (scored.isEmpty) return demoStops;
      return [
        for (var k = 0; k < scored.length; k++)
          StopInfo(
            name: scored[k].nombre,
            detail: k == 0
                ? 'Inicio del tramo · OSM'
                : 'Parada ${k + 1} · estimado',
            eta: k == 0 ? '' : 'Estimado',
            kind: k == 0
                ? StopKind.current
                : (k == 1 ? StopKind.next : StopKind.upcoming),
          ),
      ];
    } catch (_) {
      return demoStops;
    }
  }

  static List<LatLng> _flattenGeometry(Map<String, dynamic> geom) {
    final type = geom['type'] as String;
    final coords = geom['coordinates'] as List;
    final pts = <LatLng>[];
    void addPt(List c) {
      pts.add(LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()));
    }

    if (type == 'LineString') {
      for (final c in coords) {
        addPt((c as List).cast<dynamic>());
      }
    } else if (type == 'MultiLineString') {
      for (final seg in coords) {
        for (final c in (seg as List)) {
          final cl = (c as List).cast<num>();
          final pt = LatLng(cl[1].toDouble(), cl[0].toDouble());
          // Evita duplicados en la unión de segmentos fragmentados.
          if (pts.isEmpty || pts.last != pt) pts.add(pt);
        }
      }
    }
    return pts;
  }

  static String _inferMode(String nombre) {
    final n = nombre.toLowerCase();
    if (n.contains('ruta 2') || n.contains('gris') || n.contains('villlas')) {
      return 'Camión';
    }
    if (n.contains('azul') || n.contains('roja')) return 'Micro';
    return 'Combi';
  }

  static List<TransitRoute> search(List<TransitRoute> routes, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return routes;
    return routes
        .where(
          (r) =>
              r.name.toLowerCase().contains(q) ||
              r.id.toLowerCase().contains(q),
        )
        .toList();
  }
}

class _ScoredStop {
  _ScoredStop({required this.nombre, required this.index});
  final String nombre;
  final int index;
}
