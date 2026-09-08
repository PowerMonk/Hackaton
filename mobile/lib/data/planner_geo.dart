import 'package:latlong2/latlong.dart';

import '../models/app_models.dart';
import '../models/planner_models.dart';
import 'routes_repository.dart';

/// Offline planner using the same OSM route/stop assets shipped with the app.
/// It intentionally reports estimates because the assets have no timetables.
class GeoPlanner {
  const GeoPlanner._();

  static Future<PlannerResult> plan({
    required PlannerPlace origin,
    required PlannerPlace destination,
    required String priority,
    required List<String> modes,
  }) async {
    final routes = await RoutesRepository.loadDemoRoutes();
    final stops = await RoutesRepository.loadAllStops();
    final transit = modes.contains('transit');
    final plans = <PlannerOption>[];
    final originPoint = LatLng(origin.lat, origin.lon);
    final destinationPoint = LatLng(destination.lat, destination.lon);

    if (modes.contains('walk')) {
      plans.add(_walkPlan(originPoint, destinationPoint));
    }
    if (transit) {
      final routeStops = <TransitRoute, List<StopWithCoords>>{
        for (final route in routes)
          route: stops
              .where(
                (stop) =>
                    RoutesRepository.distanceToRoute(stop.position, route) <=
                    350,
              )
              .toList(),
      };
      final direct = _directPlans(routeStops, originPoint, destinationPoint);
      plans.addAll(direct);
      if (direct.isEmpty) {
        plans.addAll(_transferPlans(routeStops, originPoint, destinationPoint));
      }
    }

    if (plans.isEmpty) plans.add(_walkPlan(originPoint, destinationPoint));
    plans.sort((a, b) => _compare(a, b, priority));
    final selected = plans.take(3).toList();
    final warnings = <String>[
      'Planner offline: usa rutas OSM locales y no tiene horarios oficiales.',
      'Los tiempos de transporte y tarifas son estimados.',
    ];
    return PlannerResult(
      recommended: selected.first,
      alternatives: selected.skip(1).toList(),
      warnings: warnings,
      source: 'osm-local',
      fallback: false,
    );
  }

  static List<PlannerOption> _directPlans(
    Map<TransitRoute, List<StopWithCoords>> routeStops,
    LatLng origin,
    LatLng destination,
  ) {
    final result = <PlannerOption>[];
    for (final entry in routeStops.entries) {
      final from = _nearest(origin, entry.value);
      final to = _nearest(destination, entry.value);
      if (from == null ||
          to == null ||
          _distance(origin, from.position) > 800 ||
          _distance(destination, to.position) > 800) {
        continue;
      }
      final walking =
          _distance(origin, from.position) +
          _distance(destination, to.position);
      final transitDistance = _distance(from.position, to.position);
      result.add(_transitPlan(entry.key, transitDistance, walking));
    }
    return result;
  }

  static List<PlannerOption> _transferPlans(
    Map<TransitRoute, List<StopWithCoords>> routeStops,
    LatLng origin,
    LatLng destination,
  ) {
    final result = <PlannerOption>[];
    final entries = routeStops.entries.toList();
    for (var i = 0; i < entries.length; i++) {
      final first = entries[i];
      final from = _nearest(origin, first.value);
      if (from == null || _distance(origin, from.position) > 800) continue;
      for (var j = 0; j < entries.length; j++) {
        if (i == j) continue;
        final second = entries[j];
        final to = _nearest(destination, second.value);
        if (to == null || _distance(destination, to.position) > 800) continue;
        final transfer = _sharedStop(first.value, second.value);
        if (transfer == null) continue;
        final walking =
            _distance(origin, from.position) +
            _distance(destination, to.position);
        final transitDistance =
            _distance(from.position, transfer.position) +
            _distance(transfer.position, to.position);
        result.add(
          _transitPlan(
            first.key,
            transitDistance,
            walking,
            second: second.key,
            transfer: true,
          ),
        );
      }
    }
    return result;
  }

  static PlannerOption _transitPlan(
    TransitRoute route,
    double transitDistance,
    double walking, {
    TransitRoute? second,
    bool transfer = false,
  }) {
    final seconds =
        walking / 1.38 +
        transitDistance / (20 / 3.6) +
        (transfer ? 180 : 0) +
        120;
    return PlannerOption(
      id: 'local-${route.id}-${second?.id ?? 'direct'}',
      durationSeconds: seconds.round(),
      walkingMeters: walking.round(),
      routeNames: [route.name, if (second != null) second.name],
      cost: second == null ? 12 : 24,
      confidence: 'low',
      transfers: transfer ? 1 : 0,
      provisional: true,
      warnings: const ['Sin horarios oficiales'],
    );
  }

  static PlannerOption _walkPlan(LatLng origin, LatLng destination) {
    final distance = _distance(origin, destination) * 1.25;
    return PlannerOption(
      id: 'local-walk',
      durationSeconds: (distance / 1.38).round(),
      walkingMeters: distance.round(),
      routeNames: const [],
      cost: 0,
      confidence: 'medium',
      transfers: 0,
      provisional: true,
    );
  }

  static StopWithCoords? _nearest(LatLng point, List<StopWithCoords> stops) {
    if (stops.isEmpty) return null;
    return stops.reduce(
      (a, b) =>
          _distance(point, a.position) < _distance(point, b.position) ? a : b,
    );
  }

  static StopWithCoords? _sharedStop(
    List<StopWithCoords> a,
    List<StopWithCoords> b,
  ) {
    StopWithCoords? best;
    var bestDistance = double.infinity;
    for (final left in a) {
      for (final right in b) {
        final distance = _distance(left.position, right.position);
        if (distance <= 350 && distance < bestDistance) {
          best = left;
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  static int _compare(PlannerOption a, PlannerOption b, String priority) {
    final value = switch (priority) {
      'cheapest' => a.cost.compareTo(b.cost),
      'least_walking' => a.walkingMeters.compareTo(b.walkingMeters),
      'fewest_transfers' => a.transfers.compareTo(b.transfers),
      _ => a.durationSeconds.compareTo(b.durationSeconds),
    };
    return value != 0 ? value : a.durationSeconds.compareTo(b.durationSeconds);
  }

  static double _distance(LatLng a, LatLng b) =>
      const Distance()(a, b).toDouble();
}
