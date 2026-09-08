import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'mobility_api.dart';

/// Database status from /health endpoint.
class DatabaseStatus {
  const DatabaseStatus({
    required this.isConnected,
    required this.schemaReady,
    required this.routeCount,
    required this.stopCount,
  });

  final bool isConnected;
  final bool schemaReady;
  final int routeCount;
  final int stopCount;

  bool get isReady => isConnected && schemaReady;

  static DatabaseStatus fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const DatabaseStatus(
        isConnected: false,
        schemaReady: false,
        routeCount: 0,
        stopCount: 0,
      );
    }
    return DatabaseStatus(
      isConnected: json['connected'] as bool? ?? false,
      schemaReady: json['schemaReady'] as bool? ?? false,
      routeCount: json['routes'] as int? ?? 0,
      stopCount: json['stops'] as int? ?? 0,
    );
  }
}

/// Simulation status from /health endpoint.
class SimulationStatus {
  const SimulationStatus({
    required this.isRunning,
    required this.vehicleCount,
    required this.totalPassengers,
    required this.movingCount,
    required this.pausedCount,
    required this.dwellingCount,
  });

  final bool isRunning;
  final int vehicleCount;
  final int totalPassengers;
  final int movingCount;
  final int pausedCount;
  final int dwellingCount;

  static SimulationStatus fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const SimulationStatus(
        isRunning: false,
        vehicleCount: 0,
        totalPassengers: 0,
        movingCount: 0,
        pausedCount: 0,
        dwellingCount: 0,
      );
    }
    return SimulationStatus(
      isRunning: json['running'] as bool? ?? false,
      vehicleCount: json['vehicleCount'] as int? ?? 0,
      totalPassengers: json['totalPassengers'] as int? ?? 0,
      movingCount: json['movingCount'] as int? ?? 0,
      pausedCount: json['pausedCount'] as int? ?? 0,
      dwellingCount: json['dwellingCount'] as int? ?? 0,
    );
  }
}

/// Health status from the backend /health endpoint.
class HealthStatus {
  const HealthStatus({
    required this.isConnected,
    required this.isHealthy,
    required this.mode,
    required this.vehicleCount,
    required this.routeCount,
    required this.lastCheckedAt,
    required this.database,
    required this.simulation,
    this.version,
    this.errorMessage,
  });

  final bool isConnected;
  final bool isHealthy;
  final String mode; // 'demo' | 'live' | 'degraded' | 'offline'
  final int vehicleCount;
  final int routeCount;
  final DateTime lastCheckedAt;
  final DatabaseStatus database;
  final SimulationStatus simulation;
  final String? version;
  final String? errorMessage;

  bool get isDemoMode => mode == 'demo';
  bool get isLiveMode => mode == 'live';
  bool get isDegraded => !isHealthy || !database.isReady;
  bool get isOffline => !isConnected;

  static HealthStatus offline({String? error}) => HealthStatus(
    isConnected: false,
    isHealthy: false,
    mode: 'offline',
    vehicleCount: 0,
    routeCount: 0,
    lastCheckedAt: DateTime.now(),
    database: const DatabaseStatus(
      isConnected: false,
      schemaReady: false,
      routeCount: 0,
      stopCount: 0,
    ),
    simulation: const SimulationStatus(
      isRunning: false,
      vehicleCount: 0,
      totalPassengers: 0,
      movingCount: 0,
      pausedCount: 0,
      dwellingCount: 0,
    ),
    errorMessage: error ?? 'Sin conexión al servidor',
  );

  static HealthStatus fromJson(Map<String, dynamic> json, DateTime checkedAt) {
    final status = json['status'] as String? ?? 'degraded';
    return HealthStatus(
      isConnected: true,
      isHealthy: status == 'healthy',
      mode: json['mode'] as String? ?? 'demo',
      vehicleCount: json['vehicleCount'] as int? ?? 0,
      routeCount: json['routeCount'] as int? ?? 0,
      lastCheckedAt: checkedAt,
      database: DatabaseStatus.fromJson(
        json['database'] as Map<String, dynamic>?,
      ),
      simulation: SimulationStatus.fromJson(
        json['simulation'] as Map<String, dynamic>?,
      ),
      version: json['version'] as String?,
    );
  }
}

/// Repository for checking backend health status.
class HealthRepository {
  HealthRepository({
    String? baseUrl,
    this.checkIntervalSeconds = 30,
  }) : _baseUrl = baseUrl ?? ApiConfig.baseUrl;

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
