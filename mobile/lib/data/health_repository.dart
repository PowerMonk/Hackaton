import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

/// Health status from the backend /health endpoint.
class HealthStatus {
  const HealthStatus({
    required this.isConnected,
    required this.isHealthy,
    required this.mode,
    required this.vehicleCount,
    required this.routeCount,
    required this.lastCheckedAt,
    this.errorMessage,
  });

  final bool isConnected;
  final bool isHealthy;
  final String mode; // 'demo' | 'live' | 'degraded' | 'offline'
  final int vehicleCount;
  final int routeCount;
  final DateTime lastCheckedAt;
  final String? errorMessage;

  bool get isDemoMode => mode == 'demo';
  bool get isLiveMode => mode == 'live';
  bool get isDegraded => mode == 'degraded' || !isHealthy;
  bool get isOffline => !isConnected;

  static HealthStatus offline({String? error}) => HealthStatus(
    isConnected: false,
    isHealthy: false,
    mode: 'offline',
    vehicleCount: 0,
    routeCount: 0,
    lastCheckedAt: DateTime.now(),
    errorMessage: error ?? 'Sin conexión al servidor',
  );

  static HealthStatus fromJson(Map<String, dynamic> json, DateTime checkedAt) {
    return HealthStatus(
      isConnected: true,
      isHealthy: json['running'] == true,
      mode: json['mode'] as String? ?? 'demo',
      vehicleCount: json['vehicleCount'] as int? ?? 0,
      routeCount: json['routeCount'] as int? ?? 0,
      lastCheckedAt: checkedAt,
    );
  }
}

/// Repository for checking backend health status.
class HealthRepository {
  HealthRepository({
    String? baseUrl,
    this.checkIntervalSeconds = 30,
  }) : _baseUrl = baseUrl ?? const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  final String _baseUrl;
  final int checkIntervalSeconds;

  Timer? _timer;
  final _statusController = StreamController<HealthStatus>.broadcast();

  /// Stream of health status updates.
  Stream<HealthStatus> get statusStream => _statusController.stream;

  /// Latest cached status.
  HealthStatus? _lastStatus;
  HealthStatus? get lastStatus => _lastStatus;

  /// Check health once.
  Future<HealthStatus> checkHealth() async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/health'),
      ).timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        final status = HealthStatus.fromJson(json, DateTime.now());
        _lastStatus = status;
        _statusController.add(status);
        return status;
      } else {
        final status = HealthStatus.offline(
          error: 'Servidor respondió con código ${response.statusCode}',
        );
        _lastStatus = status;
        _statusController.add(status);
        return status;
      }
    } catch (e) {
      final status = HealthStatus.offline(
        error: e.toString().contains('TimeoutException')
            ? 'Tiempo de espera agotado'
            : 'Error de conexión',
      );
      _lastStatus = status;
      _statusController.add(status);
      return status;
    }
  }

  /// Start automatic health checks.
  void startAutoCheck() {
    stopAutoCheck();
    // Check immediately
    checkHealth();
    // Then check periodically
    _timer = Timer.periodic(
      Duration(seconds: checkIntervalSeconds),
      (_) => checkHealth(),
    );
  }

  /// Stop automatic health checks.
  void stopAutoCheck() {
    _timer?.cancel();
    _timer = null;
  }

  /// Dispose resources.
  void dispose() {
    stopAutoCheck();
    _statusController.close();
  }
}

/// Global singleton for health checks.
final healthRepository = HealthRepository();
