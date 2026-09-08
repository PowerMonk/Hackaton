import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../models/app_models.dart';
import 'trip_session.dart';

class EtaLocal {
  const EtaLocal({required this.label, required this.confianza});

  final String label;
  final String confianza;
}

/// Computes an ETA from the vehicle closest ahead of the user on a route.
class EtaEngine {
  const EtaEngine._();

  static const _distance = Distance();

  static EtaLocal forRoute({
    required TransitRoute route,
    required LatLng? userPosition,
    required Iterable<VehicleUpdate> vehicles,
  }) {
    final path = route.polyline ?? route.allPoints;
    if (path.length < 2 || userPosition == null) {
      return const EtaLocal(label: '4-6 min', confianza: 'Baja');
    }

    final userProgress = _project(path, userPosition);
    final projected = vehicles
        .where((vehicle) => vehicle.routeId == route.id)
        .map((vehicle) {
          final progress = vehicle.progress >= 0 && vehicle.progress <= 1
              ? vehicle.progress
              : _project(path, LatLng(vehicle.lat, vehicle.lon));
          return (vehicle: vehicle, progress: progress);
        })
        // Progress increases in the vehicle's route direction. A unit that
        // is already ahead of the user has passed this point.
        .where((item) => item.progress < userProgress - 0.005)
        .where(
          (item) =>
              _isCompatibleHeading(path, item.progress, item.vehicle.heading),
        )
        .toList();

    final moving = projected.where((item) => item.vehicle.speed > 1).toList();
    final candidates = moving.isNotEmpty ? moving : projected;
    if (candidates.isEmpty) {
      return const EtaLocal(label: '4-6 min', confianza: 'Baja');
    }
    final routeLength = _pathLength(path);
    final estimates = candidates.map((item) {
      final distanceM = routeLength * (userProgress - item.progress);
      final speedKmh = item.vehicle.speed > 1 ? item.vehicle.speed : 10.0;
      return (
        vehicle: item.vehicle,
        minutes: distanceM / (speedKmh / 3.6) / 60,
      );
    }).toList()..sort((a, b) => a.minutes.compareTo(b.minutes));
    final selected = estimates.first;
    final vehicle = selected.vehicle;
    final minutes = selected.minutes;
    final rounded = minutes.ceil().clamp(1, 120);
    return EtaLocal(label: '$rounded min', confianza: vehicle.confidence);
  }

  static bool _isCompatibleHeading(
    List<LatLng> path,
    double progress,
    double heading,
  ) {
    if (!heading.isFinite || path.length < 2) return true;
    final expected = _bearingAtProgress(path, progress);
    final difference = (expected - heading).abs();
    final angularDifference = difference > 180 ? 360 - difference : difference;
    return angularDifference <= 90;
  }

  static double _bearingAtProgress(List<LatLng> path, double progress) {
    final target = _pathLength(path) * progress.clamp(0.0, 1.0);
    var traversed = 0.0;
    for (var i = 0; i < path.length - 1; i++) {
      final segment = _distance(path[i], path[i + 1]).toDouble();
      if (target <= traversed + segment || i == path.length - 2) {
        final from = path[i];
        final to = path[i + 1];
        final lat1 = from.latitude * math.pi / 180;
        final lat2 = to.latitude * math.pi / 180;
        final deltaLon = (to.longitude - from.longitude) * math.pi / 180;
        final y = math.sin(deltaLon) * math.cos(lat2);
        final x =
            math.cos(lat1) * math.sin(lat2) -
            math.sin(lat1) * math.cos(lat2) * math.cos(deltaLon);
        return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
      }
      traversed += segment;
    }
    return 0;
  }

  static double _project(List<LatLng> path, LatLng point) {
    final total = _pathLength(path);
    if (total == 0) return 0;
    var before = 0.0;
    var best = double.infinity;
    var bestProgress = 0.0;
    for (var i = 0; i < path.length - 1; i++) {
      final a = path[i];
      final b = path[i + 1];
      final cosLat = _cosLatitude(point.latitude);
      final bx = (b.longitude - a.longitude) * cosLat;
      final by = b.latitude - a.latitude;
      final px = (point.longitude - a.longitude) * cosLat;
      final py = point.latitude - a.latitude;
      final denominator = bx * bx + by * by;
      final t = denominator == 0
          ? 0.0
          : ((px * bx + py * by) / denominator).clamp(0.0, 1.0);
      final dx = px - bx * t;
      final dy = py - by * t;
      final distance = dx * dx + dy * dy;
      final segment = _distance(a, b).toDouble();
      if (distance < best) {
        best = distance;
        bestProgress = (before + segment * t) / total;
      }
      before += segment;
    }
    return bestProgress.clamp(0.0, 1.0);
  }

  static double _pathLength(List<LatLng> path) {
    var length = 0.0;
    for (var i = 0; i < path.length - 1; i++) {
      length += _distance(path[i], path[i + 1]).toDouble();
    }
    return length;
  }

  static double _cosLatitude(double latitude) =>
      math.cos(latitude * math.pi / 180);
}
