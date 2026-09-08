/// Contratos del backend Bun/PostGIS (ver `context.md` → API Surface).
///
/// En v0.1 son solo firmas documentadas: la app usa datos locales
/// ([RoutesRepository]) y simulación ([DemoSimulation]).
/// Persona 2 implementará estos endpoints sin cambiar la UI.
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
  /// GPS real Android tras confirmar abordaje (futuro).
  live,

  /// Replay determinista local (actual v0.1).
  demo,
}

abstract class MobilityApi {
  Future<List<Map<String, dynamic>>> getRoutes();
  Future<Map<String, dynamic>> getRoute(String routeId);
  Future<List<Map<String, dynamic>>> getVehicles(String routeId);
  Future<Map<String, dynamic>> getEta(String stopId);
  Future<String> openBoardingSession(String routeId);
  Future<void> closeBoardingSession(String sessionId);
  Future<void> postLocation(Map<String, dynamic> sample);
}
