/// Contratos del backend Bun/PostGIS (ver `context.md` → API Surface).
///
/// Las implementaciones concretas viven en [mobility_api.dart]. La UI solo
/// depende de este contrato para poder caer a DEMO cuando LIVE no está
/// disponible.
///
/// ```http
/// GET /health
/// GET /routes
/// GET /routes/:routeId
/// GET /routes/:routeId/vehicles
/// GET /stops/:stopId
/// POST /locations
/// POST /boarding-sessions
/// DELETE /boarding-sessions/:sessionId
/// GET /stops/:stopId/eta
/// POST /route-plans
/// GET /dashboard/overview
/// GET /dashboard/vehicles
/// GET /dashboard/stops
/// WS /ws/mobility
/// ```
enum AppMode {
  /// GPS real después de confirmar abordaje.
  live,

  /// Replay determinista local.
  demo,
}

abstract interface class MobilityApi {
  Future<List<Map<String, dynamic>>> getRoutes();
  Future<Map<String, dynamic>> getRoute(String routeId);
  Future<List<Map<String, dynamic>>> getVehicles(String routeId);
  Future<Map<String, dynamic>> getEta(String stopId);
  Future<String> openBoardingSession(String routeId);
  Future<void> closeBoardingSession(String sessionId);
  Future<Map<String, dynamic>> postLocation(Map<String, dynamic> sample);
  Stream<Map<String, dynamic>> watchRoute(String routeId);
  Future<List<Map<String, dynamic>>> autocomplete(
    String query, {
    int limit = 5,
  });
  Future<Map<String, dynamic>> reverseGeocode(double lat, double lon);
}

/// Optional capability so existing API fakes do not need to implement planner
/// calls until a test or feature uses them.
abstract interface class RoutePlanningApi {
  Future<Map<String, dynamic>> planRoute(Map<String, dynamic> request);
}

extension MobilityApiPlanning on MobilityApi {
  Future<Map<String, dynamic>> planRoute(Map<String, dynamic> request) {
    if (this case final RoutePlanningApi planner) {
      return planner.planRoute(request);
    }
    try {
      final dynamic result = (this as dynamic).planRoute(request);
      return result as Future<Map<String, dynamic>>;
    } on NoSuchMethodError {
      throw UnimplementedError('Route planning is not available');
    }
  }
}
