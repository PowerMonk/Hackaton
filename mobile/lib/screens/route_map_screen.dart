import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/planner_models.dart';
import '../theme/app_theme.dart';

class RouteMapScreen extends StatefulWidget {
  const RouteMapScreen({
    super.key,
    required this.option,
    required this.origin,
    required this.destination,
  });

  final PlannerOption option;
  final String origin;
  final String destination;

  @override
  State<RouteMapScreen> createState() => _RouteMapScreenState();
}

class _RouteMapScreenState extends State<RouteMapScreen> {
  final _mapController = MapController();
  int? _selectedLegIndex;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _fitBounds();
    });
  }

  void _fitBounds() {
    if (widget.option.legs.isEmpty) return;

    final allPoints = <LatLng>[];
    for (final leg in widget.option.legs) {
      allPoints.add(LatLng(leg.from.lat, leg.from.lon));
      allPoints.add(LatLng(leg.to.lat, leg.to.lon));
      if (leg.geometry != null) {
        for (final coord in leg.geometry!) {
          allPoints.add(LatLng(coord[1], coord[0]));
        }
      }
    }

    if (allPoints.isEmpty) return;

    final bounds = LatLngBounds.fromPoints(allPoints);
    _mapController.fitCamera(
      CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(50),
      ),
    );
  }

  Color _getLegColor(String mode) {
    return switch (mode) {
      'transit' => AppColors.terracotta,
      'walk' => AppColors.teal,
      'bicycle' => AppColors.green,
      _ => AppColors.ink,
    };
  }

  IconData _getLegIcon(String mode) {
    return switch (mode) {
      'transit' => Icons.directions_bus,
      'walk' => Icons.directions_walk,
      'bicycle' => Icons.directions_bike,
      _ => Icons.circle,
    };
  }

  String _formatDistance(int meters) {
    if (meters < 1000) return '${meters}m';
    return '${(meters / 1000).toStringAsFixed(1)}km';
  }

  String _formatDuration(int seconds) {
    final minutes = (seconds / 60).round();
    if (minutes < 60) return '${minutes}min';
    final hours = minutes ~/ 60;
    final mins = minutes % 60;
    return '${hours}h ${mins}min';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.cream,
      body: Stack(
        children: [
          // Mapa
          FlutterMap(
            mapController: _mapController,
            options: const MapOptions(
              initialCenter: LatLng(19.7029, -101.1921),
              initialZoom: 13,
              minZoom: 10,
              maxZoom: 18,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.moreliaconecta.app',
              ),
              // Dibujar las rutas
              ...widget.option.legs.asMap().entries.map((entry) {
                final index = entry.key;
                final leg = entry.value;
                final isSelected = _selectedLegIndex == index;
                final color = _getLegColor(leg.mode);

                List<LatLng> points;
                if (leg.geometry != null && leg.geometry!.isNotEmpty) {
                  points = leg.geometry!
                      .map((coord) => LatLng(coord[1], coord[0]))
                      .toList();
                } else {
                  points = [
                    LatLng(leg.from.lat, leg.from.lon),
                    LatLng(leg.to.lat, leg.to.lon),
                  ];
                }

                return PolylineLayer(
                  polylines: [
                    Polyline(
                      points: points,
                      strokeWidth: isSelected ? 6 : 4,
                      color: isSelected ? color : color.withValues(alpha: 0.7),
                      borderStrokeWidth: isSelected ? 2 : 0,
                      borderColor: Colors.white,
                    ),
                  ],
                );
              }),
              // Marcadores de inicio/fin y puntos de transbordo
              MarkerLayer(
                markers: [
                  // Marcador de inicio
                  if (widget.option.legs.isNotEmpty)
                    Marker(
                      point: LatLng(
                        widget.option.legs.first.from.lat,
                        widget.option.legs.first.from.lon,
                      ),
                      width: 40,
                      height: 40,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.teal,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                        child: const Icon(
                          Icons.circle,
                          color: Colors.white,
                          size: 12,
                        ),
                      ),
                    ),
                  // Marcador de fin
                  if (widget.option.legs.isNotEmpty)
                    Marker(
                      point: LatLng(
                        widget.option.legs.last.to.lat,
                        widget.option.legs.last.to.lon,
                      ),
                      width: 40,
                      height: 40,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.terracotta,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                        child: const Icon(
                          Icons.location_on,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                    ),
                  // Marcadores de transbordo
                  for (int i = 0; i < widget.option.legs.length - 1; i++)
                    Marker(
                      point: LatLng(
                        widget.option.legs[i].to.lat,
                        widget.option.legs[i].to.lon,
                      ),
                      width: 30,
                      height: 30,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.amber,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: Center(
                          child: Text(
                            '${i + 1}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          // Header
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.6),
                    Colors.transparent,
                  ],
                ),
              ),
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 8,
                left: 16,
                right: 16,
                bottom: 16,
              ),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.black.withValues(alpha: 0.3),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.origin,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const Icon(
                          Icons.arrow_downward,
                          color: Colors.white70,
                          size: 16,
                        ),
                        Text(
                          widget.destination,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.green,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${widget.option.durationMinutes} min',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Lista de piernas de la ruta
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.4,
              ),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black26,
                    blurRadius: 10,
                    offset: Offset(0, -2),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 12),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 8,
                      ),
                      itemCount: widget.option.legs.length,
                      separatorBuilder: (_, __) => const Divider(height: 24),
                      itemBuilder: (context, index) {
                        final leg = widget.option.legs[index];
                        final isSelected = _selectedLegIndex == index;
                        final color = _getLegColor(leg.mode);

                        return Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                _selectedLegIndex =
                                    isSelected ? null : index;
                              });
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? color.withValues(alpha: 0.1)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isSelected
                                      ? color
                                      : Colors.transparent,
                                  width: 2,
                                ),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: color.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(
                                      _getLegIcon(leg.mode),
                                      color: color,
                                      size: 24,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        if (leg.mode == 'transit' &&
                                            leg.routeName != null)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            margin: const EdgeInsets.only(
                                              bottom: 6,
                                            ),
                                            decoration: BoxDecoration(
                                              color: AppColors.terracotta,
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: Text(
                                              leg.routeName!,
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontWeight: FontWeight.w800,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                        Text(
                                          leg.instructions ??
                                              _defaultInstruction(leg),
                                          style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          children: [
                                            Text(
                                              _formatDistance(
                                                leg.distanceMeters,
                                              ),
                                              style: const TextStyle(
                                                color: AppColors.muted,
                                                fontSize: 13,
                                              ),
                                            ),
                                            const Text(
                                              ' · ',
                                              style: TextStyle(
                                                color: AppColors.muted,
                                              ),
                                            ),
                                            Text(
                                              _formatDuration(
                                                leg.durationSeconds,
                                              ),
                                              style: const TextStyle(
                                                color: AppColors.muted,
                                                fontSize: 13,
                                              ),
                                            ),
                                          ],
                                        ),
                                        if (leg.from.label != null) ...[
                                          const SizedBox(height: 6),
                                          Row(
                                            children: [
                                              const Icon(
                                                Icons.circle,
                                                size: 8,
                                                color: AppColors.teal,
                                              ),
                                              const SizedBox(width: 6),
                                              Expanded(
                                                child: Text(
                                                  leg.from.label!,
                                                  style: const TextStyle(
                                                    color: AppColors.muted,
                                                    fontSize: 12,
                                                  ),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                        if (leg.to.label != null) ...[
                                          const SizedBox(height: 3),
                                          Row(
                                            children: [
                                              const Icon(
                                                Icons.location_on,
                                                size: 12,
                                                color: AppColors.terracotta,
                                              ),
                                              const SizedBox(width: 4),
                                              Expanded(
                                                child: Text(
                                                  leg.to.label!,
                                                  style: const TextStyle(
                                                    color: AppColors.muted,
                                                    fontSize: 12,
                                                  ),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _defaultInstruction(RouteLeg leg) {
    return switch (leg.mode) {
      'walk' => 'Camina',
      'transit' => leg.routeName != null
          ? 'Toma ${leg.routeName}'
          : 'Toma el transporte',
      'bicycle' => 'En bicicleta',
      _ => 'Continúa',
    };
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }
}
