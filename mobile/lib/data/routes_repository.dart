import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:latlong2/latlong.dart';

import '../models/app_models.dart';
import 'demo_data.dart';

/// Carga las rutas de Morelia desde assets locales (dataset OSM completo).
///
/// Fuente: `morelia-rutas/rutas_liviano.geojson` (ODbL, © OSM contribuidores),
/// 124 rutas con geometría simplificada (~13 m) para móvil.
/// En v0.1 todo es local y estimado; el backend Bun/PostGIS (ver context.md)
/// reemplazará esta clase sin cambiar la UI.
class RoutesRepository {
  RoutesRepository._();

  static const _rutasAsset = 'assets/geojson/rutas_morelia.geojson';
  static const _paradasAsset = 'assets/geojson/paradas_morelia.geojson';

  static const _palette = <Color>[
    Color(0xFFC94C28), // terracota
    Color(0xFF158D8E), // teal
    Color(0xFF294975), // navy
    Color(0xFFD29A14), // ámbar
    Color(0xFF6C4AB6),
    Color(0xFF2E7D32),
  ];

  /// Carga rutas reales; si falla, cae a [demoRoutes].
  ///
  /// Nota: en `flutter test` los assets grandes (>~100KB) pueden no
  /// resolverse y se usa el fallback; en la app instalada el asset de
  /// 124 rutas carga normal. El parseo está cubierto por tests unitarios
  /// vía [parseRoutesJson].
  static Future<List<TransitRoute>> loadDemoRoutes() async {
    try {
      final raw = await rootBundle.loadString(_rutasAsset);
      final routes = parseRoutesJson(raw);
      if (routes.isEmpty) return demoRoutes;
      return routes;
    } catch (_) {
      return demoRoutes;
    }
  }

  /// Loads the complete local stop set for the offline planner.
  static Future<List<StopWithCoords>> loadAllStops() async {
    try {
      final raw = await rootBundle.loadString(_paradasAsset);
      final fc = json.decode(raw) as Map<String, dynamic>;
      final features = (fc['features'] as List).cast<Map<String, dynamic>>();
      return [
        for (final feature in features)
          if (feature['geometry'] is Map) _stopFromFeature(feature),
      ];
    } catch (_) {
      return const [];
    }
  }

  static StopWithCoords _stopFromFeature(Map<String, dynamic> feature) {
    final geometry = (feature['geometry'] as Map).cast<String, dynamic>();
    final coordinates = (geometry['coordinates'] as List).cast<num>();
    final properties = (feature['properties'] as Map?)?.cast<String, dynamic>();
    final name = properties?['nombre'] as String? ?? '';
    return StopWithCoords(
      id:
          feature['id']?.toString() ??
          'stop-${coordinates[1]}-${coordinates[0]}',
      name: name.isEmpty ? '(Parada sin nombre)' : name,
      position: LatLng(coordinates[1].toDouble(), coordinates[0].toDouble()),
      isInferred: name.isEmpty,
    );
  }

  /// Parsea un FeatureCollection de rutas a [TransitRoute].
  /// Función pura (sin assets) para poder probarla con el dataset completo.
  static List<TransitRoute> parseRoutesJson(String raw) {
    final fc = json.decode(raw) as Map<String, dynamic>;
    final features = (fc['features'] as List).cast<Map<String, dynamic>>();
    final routes = <TransitRoute>[];
    var i = 0;
    for (final f in features) {
      i++;
      final props = (f['properties'] as Map).cast<String, dynamic>();
      final nombre = (props['nombre'] ?? props['ref'] ?? 'Ruta $i') as String;
      final stableId = (f['id'] ?? props['ref'] ?? props['nombre'] ?? 'Ruta $i')
          .toString();
      final ref = props['ref'] as String?;
      final geom = (f['geometry'] as Map).cast<String, dynamic>();

      // Preservar segmentos separados para MultiLineString
      final segments = _parseSegments(geom);
      if (segments.isEmpty) continue;

      // Calcular polyline aplanado para compatibilidad con código legacy
      final poly = segments.expand((s) => s).toList();
      if (poly.length < 2) continue;

      // displayCode: preferir ref, luego nombre corto
      final displayCode = ref ?? _shortCode(nombre);

      routes.add(
        TransitRoute(
          id: stableId,
          name: nombre,
          mode: _inferMode(nombre),
          frequency: 'Estimado · cada ~10 min',
          eta: '—',
          color: _palette[(i - 1) % _palette.length],
          status: RouteStatus.active,
          sharedSegment:
              (props['variantes'] as num?) != null &&
                  (props['variantes'] as num) > 1
              ? '${props['variantes']} variantes en OSM'
              : null,
          polyline: poly,
          segments: segments,
          fuente: 'osm-demo',
          esEstimado: true,
          paradasCount: (props['paradas'] as num?)?.toInt() ?? 0,
          displayCode: displayCode,
          direction: null, // Sin GTFS, no inventamos dirección
        ),
      );
    }
    routes.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return routes;
  }

  /// Extrae código corto del nombre (primeras palabras significativas).
  static String _shortCode(String nombre) {
    final words = nombre.split(RegExp(r'[\s\-]+'));
    if (words.length <= 2) return nombre;
    // Tomar máximo 2 palabras para el código
    return words.take(2).join(' ');
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
      final allPts = route.allPoints;
      if (allPts.isEmpty) return demoStops;

      for (final f in features) {
        final geom = (f['geometry'] as Map).cast<String, dynamic>();
        final coords = (geom['coordinates'] as List).cast<num>();
        final pt = LatLng(coords[1].toDouble(), coords[0].toDouble());
        var best = double.infinity;
        var bestIdx = 0;
        for (var k = 0; k < allPts.length; k++) {
          final d = dist(allPts[k], pt);
          if (d < best) {
            best = d;
            bestIdx = k;
          }
        }
        if (best <= maxMeters) {
          final props = (f['properties'] as Map).cast<String, dynamic>();
          final nombre = (props['nombre'] as String?) ?? '(parada sin nombre)';
          scored.add(
            _ScoredStop(
              nombre: nombre,
              index: bestIdx,
              position: pt,
              isInferred: nombre.isEmpty,
            ),
          );
        }
      }
      scored.sort((a, b) => a.index.compareTo(b.index));
      if (scored.isEmpty) {
        // Sin fallback silencioso - retornar lista vacía con mensaje claro
        return [
          const StopInfo(
            name: 'Sin paradas registradas',
            detail: 'Datos OSM incompletos',
            eta: '',
            kind: StopKind.upcoming,
          ),
        ];
      }
      return [
        for (var k = 0; k < scored.length; k++)
          StopInfo(
            name: scored[k].nombre,
            detail: k == 0
                ? 'Inicio del tramo · OSM'
                : scored[k].isInferred
                ? 'Parada inferida · estimado'
                : 'Parada ${k + 1} · OSM',
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

  /// Approximate distance from a user position to the nearest route point.
  /// The local dataset is simplified, so this is intentionally conservative.
  static double distanceToRoute(LatLng position, TransitRoute route) {
    if (!route.tieneGeometriaReal) return double.infinity;
    const distance = Distance();
    var nearest = double.infinity;
    for (final point in route.allPoints) {
      final d = distance(position, point);
      if (d < nearest) nearest = d;
    }
    return nearest;
  }

  /// Parsea geometría preservando segmentos separados.
  /// Cada segmento de MultiLineString se mantiene independiente.
  static List<List<LatLng>> _parseSegments(Map<String, dynamic> geom) {
    final type = geom['type'] as String;
    final coords = geom['coordinates'] as List;
    final segments = <List<LatLng>>[];

    if (type == 'LineString') {
      final pts = <LatLng>[];
      for (final c in coords) {
        final cl = (c as List).cast<num>();
        pts.add(LatLng(cl[1].toDouble(), cl[0].toDouble()));
      }
      if (pts.length >= 2) segments.add(pts);
    } else if (type == 'MultiLineString') {
      // IMPORTANTE: NO unir segmentos - cada uno es independiente
      for (final seg in coords) {
        final pts = <LatLng>[];
        for (final c in (seg as List)) {
          final cl = (c as List).cast<num>();
          pts.add(LatLng(cl[1].toDouble(), cl[0].toDouble()));
        }
        if (pts.length >= 2) segments.add(pts);
      }
    }
    return segments;
  }

  /// @deprecated Use [_parseSegments] instead.
  static List<LatLng> _flattenGeometry(Map<String, dynamic> geom) {
    return _parseSegments(geom).expand((s) => s).toList();
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
  _ScoredStop({
    required this.nombre,
    required this.index,
    required this.position,
    this.isInferred = false,
  });
  final String nombre;
  final int index;
  final LatLng position;
  final bool isInferred;
}

/// Stop with coordinates for map rendering.
class StopWithCoords {
  const StopWithCoords({
    required this.id,
    required this.name,
    required this.position,
    this.isInferred = false,
    this.distanceToRoute = 0,
  });

  final String id;
  final String name;
  final LatLng position;
  final bool isInferred;
  final double distanceToRoute;
}

extension StopsWithCoordsExtension on RoutesRepository {
  /// Get stops with coordinates for a route (for map rendering).
  static Future<List<StopWithCoords>> stopsWithCoordsFor(
    TransitRoute route, {
    double maxMeters = 350,
  }) async {
    if (!route.tieneGeometriaReal) return [];
    try {
      final raw = await rootBundle.loadString(RoutesRepository._paradasAsset);
      final fc = json.decode(raw) as Map<String, dynamic>;
      final features = (fc['features'] as List).cast<Map<String, dynamic>>();
      const dist = Distance();
      final result = <StopWithCoords>[];
      final allPts = route.allPoints;
      if (allPts.isEmpty) return [];

      for (final f in features) {
        final geom = (f['geometry'] as Map).cast<String, dynamic>();
        final coords = (geom['coordinates'] as List).cast<num>();
        final pt = LatLng(coords[1].toDouble(), coords[0].toDouble());
        var best = double.infinity;
        for (final routePt in allPts) {
          final d = dist(routePt, pt);
          if (d < best) best = d;
        }
        if (best <= maxMeters) {
          final props = (f['properties'] as Map).cast<String, dynamic>();
          final nombre = (props['nombre'] as String?) ?? '';
          final id =
              f['id']?.toString() ??
              'stop-${coords[1].toStringAsFixed(5)}-${coords[0].toStringAsFixed(5)}';
          result.add(
            StopWithCoords(
              id: id,
              name: nombre.isEmpty ? '(Parada sin nombre)' : nombre,
              position: pt,
              isInferred: nombre.isEmpty,
              distanceToRoute: best,
            ),
          );
        }
      }
      // Sort by distance to route
      result.sort((a, b) => a.distanceToRoute.compareTo(b.distanceToRoute));
      return result;
    } catch (_) {
      return [];
    }
  }
}
