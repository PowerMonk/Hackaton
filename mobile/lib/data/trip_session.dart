import 'dart:async';

import '../models/mobility_models.dart';
import '../models/proximity_models.dart';
import 'api_contracts.dart';
import 'location_source.dart';

enum TripConnectionMode { demo, localOnly, live, fallbackDemo }

class TripStartResult {
  const TripStartResult({required this.mode, this.error});

  final TripConnectionMode mode;
  final String? error;
}

/// Vehicle update received from WebSocket.
class VehicleUpdate {
  const VehicleUpdate({
    required this.id,
    required this.routeId,
    required this.progress,
    required this.speed,
    required this.heading,
    required this.passengerCount,
    required this.confidence,
    required this.lat,
    required this.lon,
    required this.lastUpdateAt,
    required this.isSimulated,
  });

  final String id;
  final String routeId;
  final double progress;
  final double speed; // km/h
  final double heading;
  final int passengerCount;
  final String confidence;
  final double lat;
  final double lon;
  final DateTime lastUpdateAt;
  final bool isSimulated;

  factory VehicleUpdate.fromJson(Map<String, dynamic> json) {
    final position = json['currentPosition'] as Map<String, dynamic>? ?? {};
    final rawTimestamp = json['lastUpdateAt'];
    final lastUpdateAt = rawTimestamp is String
        ? DateTime.tryParse(rawTimestamp) ?? DateTime.fromMillisecondsSinceEpoch(0)
        : DateTime.fromMillisecondsSinceEpoch(
            (rawTimestamp as num?)?.toInt() ?? 0,
          );
    return VehicleUpdate(
      id: json['id'] as String? ?? '',
      routeId: json['routeId'] as String? ?? '',
      progress: (json['progress'] as num?)?.toDouble() ?? 0,
      speed: (json['speed'] as num?)?.toDouble() ?? 0,
      heading: (json['heading'] as num?)?.toDouble() ?? 0,
      passengerCount: (json['passengerCount'] as num?)?.toInt() ?? 0,
      confidence: json['confidence'] as String? ?? 'Baja',
      lat: (position['lat'] as num?)?.toDouble() ?? 0,
      lon: (position['lon'] as num?)?.toDouble() ?? 0,
      lastUpdateAt: lastUpdateAt,
      isSimulated: json['isSimulated'] as bool? ?? true,
    );
  }
}

class TripSessionController {
  TripSessionController({
    required this.api,
    required this.locationSource,
    required this.mode,
    this.onError,
    this.onVehicleUpdate,
    this.onBoardingStateUpdate,
    this.onProximityNotification,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final MobilityApi api;
  final LocationSource locationSource;
  final AppMode mode;
  final void Function(String message)? onError;
  final void Function(List<VehicleUpdate> vehicles)? onVehicleUpdate;
  final void Function(BoardingState state)? onBoardingStateUpdate;
  final void Function(ProximityNotification notification)? onProximityNotification;
  final DateTime Function() _now;

  StreamSubscription<LocationSample>? _locationSubscription;
  StreamSubscription<Map<String, dynamic>>? _mobilitySubscription;
  String? _sessionId;
  String? _routeId;
  DateTime? _lastSentAt;

  // Expose vehicle stream
  final _vehicleController = StreamController<List<VehicleUpdate>>.broadcast();
  Stream<List<VehicleUpdate>> get vehicleStream => _vehicleController.stream;

  // Expose boarding state stream
  final _boardingStateController = StreamController<BoardingState>.broadcast();
  Stream<BoardingState> get boardingStateStream => _boardingStateController.stream;

  // Latest vehicles
  List<VehicleUpdate> _latestVehicles = [];
  List<VehicleUpdate> get latestVehicles => _latestVehicles;

  // Latest boarding state
  BoardingState _boardingState = BoardingState.empty;
  BoardingState get boardingState => _boardingState;

  // Session ID for external access
  String? get sessionId => _sessionId;

  Future<TripStartResult> start(String routeId) async {
    await stop();
    if (mode == AppMode.demo) {
      return const TripStartResult(mode: TripConnectionMode.demo);
    }

    try {
      final permission = await locationSource.requestPermission();
      if (permission != LocationPermissionState.granted) {
        return TripStartResult(
          mode: TripConnectionMode.fallbackDemo,
          error: _permissionMessage(permission),
        );
      }

      _sessionId = await api.openBoardingSession(routeId);
      _routeId = routeId;
      _lastSentAt = null;
      _boardingState = BoardingState.empty;
      _locationSubscription = locationSource.locationStream.listen(
        (sample) => unawaited(_sendLocation(sample)),
        onError: (Object error, StackTrace _) => _report(error),
      );
      await watchRoute(routeId);
      return const TripStartResult(mode: TripConnectionMode.live);
    } catch (error) {
      await stop();
      return TripStartResult(
        mode: TripConnectionMode.fallbackDemo,
        error: _message(error),
      );
    }
  }

  Future<void> watchRoute(String routeId) async {
    await stopVehicleStream();
    _mobilitySubscription = api.watchRoute(routeId).listen(
      _processWebSocketMessage,
      onError: (Object error, StackTrace _) => _report(error),
    );
  }

  Future<void> stopVehicleStream() async {
    await _mobilitySubscription?.cancel();
    _mobilitySubscription = null;
    _latestVehicles = [];
    if (!_vehicleController.isClosed) {
      _vehicleController.add(const []);
    }
  }

  void _processWebSocketMessage(Map<String, dynamic> message) {
    final type = message['type'] as String?;

    // Handle both vehicle_update and vehicle_snapshot (initial data)
    if (type == 'vehicle_update' || type == 'vehicle_snapshot') {
      final payload = message['payload'] as Map<String, dynamic>?;
      if (payload == null) return;

      final vehiclesJson = payload['vehicles'] as List<dynamic>? ?? [];
      final vehicles = vehiclesJson
          .whereType<Map<String, dynamic>>()
          .map(VehicleUpdate.fromJson)
          .toList();

      _latestVehicles = vehicles;
      _vehicleController.add(vehicles);
      onVehicleUpdate?.call(vehicles);
    } else if (type == 'connected') {
      // Connection established - no action needed
    } else if (type == 'subscribed') {
      // Subscription confirmed - initial snapshot should follow
    } else if (type == 'error') {
      final payload = message['payload'] as Map<String, dynamic>?;
      final errorMsg = payload?['message'] as String? ?? 'WebSocket error';
      onError?.call(errorMsg);
    }
  }

  Future<void> stop() async {
    await _locationSubscription?.cancel();
    await stopVehicleStream();
    _locationSubscription = null;
    await locationSource.stop();
    final sessionId = _sessionId;
    _sessionId = null;
    if (sessionId != null) {
      try {
        await api.closeBoardingSession(sessionId);
      } catch (error) {
        _report(error);
      }
    }
  }

  void dispose() {
    _vehicleController.close();
    _boardingStateController.close();
  }

  Future<void> _sendLocation(LocationSample sample) async {
    final sessionId = _sessionId;
    if (sessionId == null || !_isDue(sample)) return;
    _lastSentAt = _now();
    try {
      final response = await api.postLocation(sample.toJson(sessionId: sessionId));

      // Process boarding state from response if available
      final boardingStateJson = response['boardingState'] as Map<String, dynamic>?;
      if (boardingStateJson != null) {
        _boardingState = BoardingState.fromJson(boardingStateJson);
        _boardingStateController.add(_boardingState);
        onBoardingStateUpdate?.call(_boardingState);

        // Process notifications
        for (final notification in _boardingState.notifications) {
          onProximityNotification?.call(notification);
        }
      }
    } catch (error) {
      _report(error);
    }
  }

  bool _isDue(LocationSample sample) {
    final last = _lastSentAt;
    if (last == null) return true;
    final moving = (sample.speed ?? 0) >= 2;
    final interval = moving
        ? const Duration(seconds: 15)
        : const Duration(seconds: 45);
    return _now().difference(last) >= interval;
  }

  void _report(Object error) => onError?.call(_message(error));

  static String _permissionMessage(LocationPermissionState state) =>
      switch (state) {
        LocationPermissionState.denied =>
          'Permiso de ubicación denegado; usando modo DEMO.',
        LocationPermissionState.deniedForever =>
          'Permiso de ubicación bloqueado en ajustes; usando modo DEMO.',
        LocationPermissionState.serviceDisabled =>
          'La ubicación está desactivada; usando modo DEMO.',
        LocationPermissionState.granted => '',
      };

  static String _message(Object error) =>
      error.toString().replaceFirst('MobilityApiException(null): ', '');
}
