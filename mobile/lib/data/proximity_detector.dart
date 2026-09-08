import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../models/app_models.dart';
import '../models/proximity_models.dart';
import 'routes_repository.dart';
import 'trip_session.dart';

class ProximityDetectorConfig {
  const ProximityDetectorConfig({
    this.nearStopMeters = 100,
    this.atStopMeters = 30,
    this.vehicleApproachMeters = 300,
    this.routeCorridorMeters = 80,
    this.promptCooldown = const Duration(seconds: 90),
  });

  final double nearStopMeters;
  final double atStopMeters;
  final double vehicleApproachMeters;
  final double routeCorridorMeters;
  final Duration promptCooldown;
}

/// Local pre-boarding detector. Live sessions can additionally use the
/// backend's BoardingState returned by POST /locations.
class ProximityDetector {
  ProximityDetector({
    required this.route,
    required this.stops,
    this.config = const ProximityDetectorConfig(),
  });

  final TransitRoute route;
  final List<StopWithCoords> stops;
  final ProximityDetectorConfig config;

  DateTime? _lastPromptAt;

  BoardingState evaluate({
    required LatLng? userPosition,
    required List<VehicleUpdate> vehicles,
    DateTime? now,
    bool isOnVehicle = false,
  }) {
    final timestamp = now ?? DateTime.now();
    if (userPosition == null || route.allPoints.length < 2) {
      return BoardingState.empty;
    }

    final projection = _project(userPosition);
    final nearby =
        stops
            .map(
              (stop) => (
                stop: stop,
                distance: _distance(userPosition, stop.position),
              ),
            )
            .where((item) => item.distance <= config.nearStopMeters)
            .map(
              (item) => NearbyStop(
                id: item.stop.id,
                name: item.stop.name,
                distanceMeters: item.distance,
                routeIds: [route.id],
              ),
            )
            .toList()
          ..sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));

    final closest = nearby.isEmpty ? null : nearby.first;
    final atStop =
        closest != null && closest.distanceMeters <= config.atStopMeters;
    final onRoute = projection.distanceMeters <= config.routeCorridorMeters;
    final targetProgress = _targetProgress(projection.progress);
    final approaching = _closestApproachingVehicle(
      vehicles,
      targetProgress,
      userPosition,
    );
    final vehicleDistance = approaching == null
        ? double.infinity
        : _distance(userPosition, LatLng(approaching.lat, approaching.lon));
    final vehicleNear = vehicleDistance <= config.vehicleApproachMeters;
    final shouldPrompt =
        !isOnVehicle &&
        onRoute &&
        closest != null &&
        vehicleNear &&
        _cooldownElapsed(timestamp);

    final events = <ProximityEvent>[];
    if (isOnVehicle) {
      events.add(_event('on_vehicle', 'Tu viaje está activo.', timestamp));
    } else if (shouldPrompt) {
      _lastPromptAt = timestamp;
      events.add(
        _event(
          'boarding_likely',
          'Una unidad de ${route.name} está a ${vehicleDistance.round()} m.',
          timestamp,
          stop: closest,
        ),
      );
    } else if (atStop) {
      events.add(
        _event(
          'at_stop',
          'Estás en un punto de abordaje.',
          timestamp,
          stop: closest,
        ),
      );
    } else if (closest != null) {
      events.add(
        _event(
          'near_stop',
          'Acércate al recorrido para abordar.',
          timestamp,
          stop: closest,
        ),
      );
    }

    final notifications = shouldPrompt
        ? [
            ProximityNotification(
              id: 'local-${timestamp.millisecondsSinceEpoch}',
              type: 'boarding_prompt',
              title: 'Unidad próxima',
              body: 'La ruta ${route.name} está cerca de ${closest.name}.',
              priority: 'high',
              data: {'routeId': route.id, 'distanceMeters': vehicleDistance},
            ),
          ]
        : const <ProximityNotification>[];

    return BoardingState(
      isNearStop: closest != null,
      isOnVehicle: isOnVehicle,
      nearbyStops: nearby,
      currentRouteId: route.id,
      routeProgress: projection.progress,
      lastStopId: closest?.id,
      events: events,
      notifications: notifications,
    );
  }

  bool _cooldownElapsed(DateTime now) =>
      _lastPromptAt == null ||
      now.difference(_lastPromptAt!) >= config.promptCooldown;

  VehicleUpdate? _closestApproachingVehicle(
    List<VehicleUpdate> vehicles,
    double targetProgress,
    LatLng userPosition,
  ) {
    final candidates =
        vehicles
            .where(
              (vehicle) => vehicle.routeId == route.id && vehicle.speed >= 3,
            )
            .where(
              (vehicle) =>
                  _project(LatLng(vehicle.lat, vehicle.lon)).progress <=
                  targetProgress,
            )
            .toList()
          ..sort(
            (a, b) => _distance(
              userPosition,
              LatLng(a.lat, a.lon),
            ).compareTo(_distance(userPosition, LatLng(b.lat, b.lon))),
          );
    return candidates.isEmpty ? null : candidates.first;
  }

  double _targetProgress(double userProgress) {
    final ahead =
        stops
            .map((stop) => _project(stop.position).progress)
            .where((progress) => progress >= userProgress)
            .toList()
          ..sort();
    return ahead.isEmpty ? userProgress : ahead.first;
  }

  _Projection _project(LatLng point) {
    final points = route.allPoints;
    var total = 0.0;
    for (var i = 0; i < points.length - 1; i++) {
      total += _distance(points[i], points[i + 1]);
    }
    if (total == 0) return const _Projection(0, double.infinity);

    var traveled = 0.0;
    var bestDistance = double.infinity;
    var bestProgress = 0.0;
    for (var i = 0; i < points.length - 1; i++) {
      final a = points[i];
      final b = points[i + 1];
      final latScale = math.pi / 180;
      final longitudeScale = latScale * math.cos(point.latitude * latScale);
      final x = (b.longitude - a.longitude) * longitudeScale;
      final y = b.latitude - a.latitude;
      final px = (point.longitude - a.longitude) * longitudeScale;
      final py = point.latitude - a.latitude;
      final denominator = x * x + y * y;
      final t = denominator == 0
          ? 0.0
          : ((px * x + py * y) / denominator).clamp(0.0, 1.0);
      final candidate = LatLng(
        a.latitude + y * t,
        a.longitude + (b.longitude - a.longitude) * t,
      );
      final distance = _distance(point, candidate);
      final segment = _distance(a, b);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestProgress = (traveled + segment * t) / total;
      }
      traveled += segment;
    }
    return _Projection(bestProgress.clamp(0.0, 1.0), bestDistance);
  }

  static double _distance(LatLng a, LatLng b) =>
      const Distance()(a, b).toDouble();

  ProximityEvent _event(
    String type,
    String message,
    DateTime timestamp, {
    NearbyStop? stop,
  }) => ProximityEvent(
    type: type,
    stopId: stop?.id,
    stopName: stop?.name,
    routeId: route.id,
    confidence: 'Media',
    message: message,
    timestamp: timestamp,
  );
}

class _Projection {
  const _Projection(this.progress, this.distanceMeters);

  final double progress;
  final double distanceMeters;
}
