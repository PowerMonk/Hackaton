import 'dart:math';

import '../models/planner_models.dart';

class PlannerLocalFallback {
  const PlannerLocalFallback._();

  static PlannerResult plan({
    required PlannerPlace origin,
    required PlannerPlace destination,
    required String priority,
    required String mode,
  }) {
    final distance = _distanceMeters(
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
    );
    final walk = _option(
      id: 'local-walk',
      durationSeconds: distance * 1.25 / 1.38,
      walkingMeters: distance * 1.25,
      cost: 0,
      routeNames: const [],
    );
    final transit = _option(
      id: 'local-transit',
      durationSeconds: distance / 5.55 + 8 * 60,
      walkingMeters: 450,
      cost: 12,
      routeNames: const ['R12'],
      transfers: 0,
    );
    final bicycle = _option(
      id: 'local-bicycle',
      durationSeconds: distance / 4.2,
      walkingMeters: 120,
      cost: 0,
      routeNames: const ['Bici'],
    );

    final options = switch (mode) {
      'A pie' => [walk, transit, bicycle],
      'Bici' => [bicycle, transit, walk],
      _ => [transit, walk, bicycle],
    };
    options.sort((left, right) => _compare(left, right, priority));

    return PlannerResult(
      recommended: options.first,
      alternatives: options.skip(1).toList(),
      source: 'local-demo',
      fallback: true,
      warnings: const [
        'Plan provisional calculado localmente; no hay horarios oficiales.',
        'Costo y duración estimados; pueden variar.',
      ],
    );
  }

  static PlannerOption _option({
    required String id,
    required double durationSeconds,
    required double walkingMeters,
    required double cost,
    required List<String> routeNames,
    int transfers = 0,
  }) => PlannerOption(
    id: id,
    durationSeconds: durationSeconds.round(),
    walkingMeters: walkingMeters.round(),
    routeNames: routeNames,
    cost: cost,
    confidence: 'low',
    transfers: transfers,
    provisional: true,
  );

  static int _compare(
    PlannerOption left,
    PlannerOption right,
    String priority,
  ) {
    final leftValues = switch (priority) {
      'cheapest' => [left.cost, left.durationSeconds, left.walkingMeters],
      'least_walking' => [
        left.walkingMeters.toDouble(),
        left.durationSeconds.toDouble(),
        left.cost,
      ],
      'fewest_transfers' => [
        left.transfers.toDouble(),
        left.durationSeconds.toDouble(),
        left.cost,
      ],
      _ => [
        left.durationSeconds.toDouble(),
        left.walkingMeters.toDouble(),
        left.cost,
      ],
    };
    final rightValues = switch (priority) {
      'cheapest' => [right.cost, right.durationSeconds, right.walkingMeters],
      'least_walking' => [
        right.walkingMeters.toDouble(),
        right.durationSeconds.toDouble(),
        right.cost,
      ],
      'fewest_transfers' => [
        right.transfers.toDouble(),
        right.durationSeconds.toDouble(),
        right.cost,
      ],
      _ => [
        right.durationSeconds.toDouble(),
        right.walkingMeters.toDouble(),
        right.cost,
      ],
    };
    for (var index = 0; index < leftValues.length; index++) {
      final comparison = leftValues[index].compareTo(rightValues[index]);
      if (comparison != 0) return comparison;
    }
    return left.id.compareTo(right.id);
  }

  static double _distanceMeters(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const earthRadius = 6371000.0;
    final dLat = _radians(lat2 - lat1);
    final dLon = _radians(lon2 - lon1);
    final a =
        (sin(dLat / 2) * sin(dLat / 2)) +
        cos(_radians(lat1)) *
            cos(_radians(lat2)) *
            sin(dLon / 2) *
            sin(dLon / 2);
    return earthRadius * 2 * atan2(sqrt(a), sqrt(1 - a));
  }

  static double _radians(double degrees) => degrees * 3.141592653589793 / 180;
}
