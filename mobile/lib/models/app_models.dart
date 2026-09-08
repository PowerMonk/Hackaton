import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

enum RouteStatus { active, inactive }

class TransitRoute {
  const TransitRoute({
    required this.id,
    required this.name,
    required this.mode,
    required this.frequency,
    required this.eta,
    required this.color,
    required this.status,
    this.sharedSegment,
    this.polyline,
    this.fuente = 'mock',
    this.esEstimado = true,
    this.paradasCount = 0,
  });

  final String id;
  final String name;
  final String mode;
  final String frequency;
  final String eta;
  final Color color;
  final RouteStatus status;
  final String? sharedSegment;

  /// Geometría real (GeoJSON OSM, fuente local). Null = mock antiguo.
  final List<LatLng>? polyline;

  /// 'mock' | 'osm-demo' | 'api' — para etiquetar Estimado/Simulado.
  final String fuente;

  /// true mientras no haya backend/PostGIS (ver context.md).
  final bool esEstimado;

  /// Nº de paradas asociadas (proximidad o GTFS futuro).
  final int paradasCount;

  bool get tieneGeometriaReal =>
      polyline != null && polyline!.length >= 2;

  TransitRoute copyWith({
    String? frequency,
    String? eta,
    RouteStatus? status,
    List<LatLng>? polyline,
    String? fuente,
    bool? esEstimado,
    int? paradasCount,
  }) {
    return TransitRoute(
      id: id,
      name: name,
      mode: mode,
      frequency: frequency ?? this.frequency,
      eta: eta ?? this.eta,
      color: color,
      status: status ?? this.status,
      sharedSegment: sharedSegment,
      polyline: polyline ?? this.polyline,
      fuente: fuente ?? this.fuente,
      esEstimado: esEstimado ?? this.esEstimado,
      paradasCount: paradasCount ?? this.paradasCount,
    );
  }
}

class StopInfo {
  const StopInfo({
    required this.name,
    required this.detail,
    required this.eta,
    required this.kind,
  });

  final String name;
  final String detail;
  final String eta;
  final StopKind kind;
}

enum StopKind { passed, current, next, upcoming, terminal }
