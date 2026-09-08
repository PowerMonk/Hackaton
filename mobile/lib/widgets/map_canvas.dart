import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../data/demo_simulation.dart';
import '../models/app_models.dart';
import '../theme/app_theme.dart';

class DemoMap extends StatelessWidget {
  const DemoMap({
    required this.route,
    this.showDemoLabel = false,
    this.height = 400,
    super.key,
  });

  final TransitRoute route;
  final bool showDemoLabel;
  final double height;

  static const userPosition = LatLng(19.70234, -101.18492);
  static const vehiclePosition = LatLng(19.70452, -101.19006);
  static const isFlutterTest = bool.fromEnvironment('FLUTTER_TEST');

  static final _routePoints = <LatLng>[
    const LatLng(19.69286, -101.17402),
    const LatLng(19.69644, -101.17756),
    const LatLng(19.69945, -101.18122),
    userPosition,
    const LatLng(19.70376, -101.18814),
    vehiclePosition,
    const LatLng(19.70768, -101.19738),
  ];

  List<LatLng> get _effectivePolyline =>
      route.tieneGeometriaReal ? route.polyline! : _routePoints;

  LatLng get _center {
    final pts = _effectivePolyline;
    return pts[pts.length ~/ 2];
  }

  LatLng get _simUser {
    if (!route.tieneGeometriaReal) return userPosition;
    return DemoSimulation().positionAt(_effectivePolyline, 0.35);
  }

  LatLng get _simVehicle {
    if (!route.tieneGeometriaReal) return vehiclePosition;
    return DemoSimulation().positionAt(_effectivePolyline, 0.55);
  }

  List<LatLng> get _simStops {
    if (!route.tieneGeometriaReal) {
      return const [
        LatLng(19.69644, -101.17756),
        LatLng(19.69945, -101.18122),
        LatLng(19.70376, -101.18814),
      ];
    }
    final pts = _effectivePolyline;
    return [pts.first, pts[pts.length ~/ 2], pts.last];
  }

  @override
  Widget build(BuildContext context) {
    final pts = _effectivePolyline;
    final user = _simUser;
    final vehicle = _simVehicle;
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
                    if (!route.tieneGeometriaReal)
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
                    Polyline(
                      points: pts,
                      color: route.color,
                      strokeWidth: 9,
                      borderColor: Colors.white,
                      borderStrokeWidth: 3,
                    ),
                  ],
                ),
                MarkerLayer(
                  markers: [
                    for (final s in _simStops) _stopMarker(s),
                    Marker(
                      point: user,
                      width: 46,
                      height: 46,
                      child: const _UserMarker(),
                    ),
                    Marker(
                      point: vehicle,
                      width: 58,
                      height: 58,
                      child: const _VehicleMarker(),
                    ),
                    const Marker(
                      point: LatLng(19.7059, -101.1929),
                      width: 138,
                      height: 44,
                      child: _PlaceLabel(),
                    ),
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
          Positioned(
            top: 16,
            left: 16,
            child: _MapPill(
              label: showDemoLabel
                  ? 'Modo demostración'
                  : (route.tieneGeometriaReal
                        ? 'OSM demo · 1 unidad sim.'
                        : '1 unidad · hace 28 s'),
              dark: showDemoLabel,
            ),
          ),
          if (showDemoLabel)
            const Positioned(
              top: 16,
              right: 16,
              child: _MapPill(label: 'Datos simulados'),
            ),
        ],
      ),
    );
  }

  static Marker _stopMarker(LatLng point) => Marker(
    point: point,
    width: 28,
    height: 28,
    child: Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFFC94C28), width: 4),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 8)],
      ),
    ),
  );
}

class _MapPill extends StatelessWidget {
  const _MapPill({required this.label, this.dark = false});

  final String label;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: dark ? AppColors.ink : const Color(0xFFE1F4E8),
        borderRadius: BorderRadius.circular(28),
        border: dark ? null : Border.all(color: const Color(0xFF9ED5B6)),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 12)],
      ),
      child: Text(
        label,
        style: TextStyle(
          color: dark ? Colors.white : AppColors.green,
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: AppColors.ink,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.greenBright, width: 5),
        boxShadow: const [
          BoxShadow(color: Color(0x33209D65), blurRadius: 0, spreadRadius: 12),
        ],
      ),
      child: const Icon(Icons.directions_bus, color: Colors.white, size: 25),
    );
  }
}

class _UserMarker extends StatelessWidget {
  const _UserMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.ink,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 5),
        boxShadow: const [
          BoxShadow(color: Color(0x221B2738), blurRadius: 0, spreadRadius: 12),
        ],
      ),
    );
  }
}

class _PlaceLabel extends StatelessWidget {
  const _PlaceLabel();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(22),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_city, color: Colors.white, size: 17),
            const SizedBox(width: 7),
            const Text(
              'Catedral',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
