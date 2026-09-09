import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../data/demo_simulation.dart';
import '../data/routes_repository.dart';
import '../data/trip_session.dart';
import '../models/app_models.dart';
import '../theme/app_theme.dart';

class DemoMap extends StatelessWidget {
  const DemoMap({
    required this.route,
    this.userPosition,
    this.locationAccuracy,
    this.isLiveLocation = false,
    this.showDemoLabel = false,
    this.showRoute = true,
    this.height = 400,
    this.vehicles = const [],
    this.stops = const [],
    this.showFreshnessInfo = false,
    this.lastUpdateAt,
    super.key,
  });

  final TransitRoute route;
  final LatLng? userPosition;
  final double? locationAccuracy;
  final bool isLiveLocation;
  final bool showDemoLabel;
  final bool showRoute;
  final double height;

  /// Real vehicles from WebSocket/API.
  final List<VehicleUpdate> vehicles;

  /// Real stops from backend/GeoJSON.
  final List<StopWithCoords> stops;

  /// Show freshness/timestamp info on the map.
  final bool showFreshnessInfo;

  /// Last update timestamp for freshness display.
  final DateTime? lastUpdateAt;

  static const demoUserPosition = LatLng(19.70234, -101.18492);
  static const demoVehiclePosition = LatLng(19.70452, -101.19006);
  static const isFlutterTest = bool.fromEnvironment('FLUTTER_TEST');

  static final _routePoints = <LatLng>[
    const LatLng(19.69286, -101.17402),
    const LatLng(19.69644, -101.17756),
    const LatLng(19.69945, -101.18122),
    demoUserPosition,
    const LatLng(19.70376, -101.18814),
    demoVehiclePosition,
    const LatLng(19.70768, -101.19738),
  ];

  /// Retorna los segmentos de la ruta (preservados de MultiLineString).
  List<List<LatLng>> get _effectiveSegments {
    if (!showRoute || !route.tieneGeometriaReal) {
      return [_routePoints];
    }
    // Usar segmentos si están disponibles, sino crear uno solo con polyline
    if (route.segments != null && route.segments!.isNotEmpty) {
      return route.segments!;
    }
    return [route.polyline ?? _routePoints];
  }

  /// Todos los puntos aplanados (para cálculos de centro, posición, etc.)
  List<LatLng> get _allPoints => _effectiveSegments.expand((s) => s).toList();

  LatLng get _center {
    if (isLiveLocation && userPosition != null) return userPosition!;
    final pts = _allPoints;
    if (pts.isEmpty) return demoUserPosition;
    return pts[pts.length ~/ 2];
  }

  LatLng get _simUser {
    if (!showRoute || !route.tieneGeometriaReal) return demoUserPosition;
    return DemoSimulation().positionAt(_allPoints, 0.35);
  }

  LatLng get _simVehicle {
    if (!showRoute || !route.tieneGeometriaReal) return demoVehiclePosition;
    return DemoSimulation().positionAt(_allPoints, 0.55);
  }

  /// Returns true if we have real vehicles from WebSocket.
  bool get _hasRealVehicles => vehicles.isNotEmpty;

  /// Generates vehicle markers - prefers real vehicles, falls back to simulated.
  List<Marker> get _vehicleMarkers {
    if (_hasRealVehicles) {
      return vehicles
          .map(
            (v) => Marker(
              point: LatLng(v.lat, v.lon),
              width: 58,
              height: 58,
              child: _VehicleMarker(
                speed: v.speed,
                confidence: v.confidence,
                heading: v.heading,
                isSimulated: v.isSimulated,
              ),
            ),
          )
          .toList();
    }

    // Fallback to single demo vehicle
    if (showRoute) {
      return [
        Marker(
          point: _simVehicle,
          width: 58,
          height: 58,
          child: const _VehicleMarker(),
        ),
      ];
    }

    return [];
  }

  @override
  Widget build(BuildContext context) {
    final segments = _effectiveSegments;
    final user = isLiveLocation ? userPosition : _simUser;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: _center,
                initialZoom: route.tieneGeometriaReal ? 13.2 : 14.3,
                minZoom: 11,
                maxZoom: 18,
                backgroundColor: AppColors.cream,
                interactionOptions: const InteractionOptions(
                  flags:
                      InteractiveFlag.drag |
                      InteractiveFlag.pinchZoom |
                      InteractiveFlag.doubleTapZoom,
                ),
              ),
              children: [
                if (!isFlutterTest)
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    fallbackUrl:
                        'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.example.morelia_conecta',
                    errorTileCallback: (_, __, ___) {},
                  ),
                PolylineLayer(
                  polylines: [
                    if (showRoute && !route.tieneGeometriaReal)
                      Polyline(
                        points: const [
                          LatLng(19.6955, -101.1955),
                          LatLng(19.6992, -101.1897),
                          LatLng(19.704, -101.1808),
                          LatLng(19.7082, -101.1739),
                        ],
                        color: AppColors.teal.withValues(alpha: 0.35),
                        strokeWidth: 7,
                      ),
                    // Dibujar cada segmento como polyline separado
                    // NO conectar segmentos entre sí
                    if (showRoute)
                      for (final segment in segments)
                        Polyline(
                          points: segment,
                          color: route.color,
                          strokeWidth: 9,
                          borderColor: Colors.white,
                          borderStrokeWidth: 3,
                        ),
                  ],
                ),
                MarkerLayer(
                  markers: [
                    // User position marker
                    if (user != null)
                      Marker(
                        point: user,
                        width: 46,
                        height: 46,
                        child: _UserMarker(
                          accuracy: isLiveLocation ? locationAccuracy : null,
                        ),
                      ),

                    // Vehicles: prefer real from WebSocket, fallback to simulated
                    ..._vehicleMarkers,
                  ],
                ),
                RichAttributionWidget(
                  attributions: [
                    TextSourceAttribution('OpenStreetMap contributors'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Crea un marcador para una parada real.
  /// Use esto cuando tenga coordenadas de paradas desde el backend/GeoJSON.
  static Marker createStopMarker(LatLng point, {bool isInferred = false}) =>
      Marker(
        point: point,
        width: 28,
        height: 28,
        child: StopMarkerWidget(isInferred: isInferred),
      );
}

class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker({
    this.speed,
    this.confidence,
    this.heading,
    this.isSimulated = true,
  });

  final double? speed;
  final String? confidence;
  final double? heading;
  final bool isSimulated;

  Color get _borderColor {
    if (confidence == 'Alta') return AppColors.greenBright;
    if (confidence == 'Media') return AppColors.amber;
    return AppColors.terracotta;
  }

  bool get _isPaused => speed != null && speed! < 1;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Transform.rotate(
          angle: heading != null ? (heading! * 3.14159 / 180) : 0,
          child: Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: _isPaused ? AppColors.muted : AppColors.ink,
              shape: BoxShape.circle,
              border: Border.all(color: _borderColor, width: 5),
              boxShadow: [
                BoxShadow(
                  color: _borderColor.withValues(alpha: 0.3),
                  blurRadius: 0,
                  spreadRadius: 12,
                ),
              ],
            ),
            child: Icon(
              _isPaused ? Icons.pause : Icons.directions_bus,
              color: Colors.white,
              size: 25,
            ),
          ),
        ),
        // Speed indicator (only for real vehicles)
        if (speed != null && !isSimulated)
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.ink,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${speed!.round()} km/h',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
      ],
    );
  }
}

class _UserMarker extends StatelessWidget {
  const _UserMarker({this.accuracy});

  final double? accuracy;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.ink,
        shape: BoxShape.circle,
        border: Border.all(
          color: accuracy == null ? Colors.white : AppColors.greenBright,
          width: 5,
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x221B2738), blurRadius: 0, spreadRadius: 12),
        ],
      ),
    );
  }
}

/// Marcador para paradas reales (cuando se integren desde backend/GeoJSON).
class StopMarkerWidget extends StatelessWidget {
  const StopMarkerWidget({this.name, this.isInferred = false, super.key});

  final String? name;
  final bool isInferred;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(
          color: isInferred ? Colors.grey : const Color(0xFFC94C28),
          width: 4,
        ),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 8)],
      ),
    );
  }
}
