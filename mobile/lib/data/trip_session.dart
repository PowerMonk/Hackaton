import 'dart:async';

import '../models/mobility_models.dart';
import 'api_contracts.dart';
import 'location_source.dart';

enum TripConnectionMode { demo, localOnly, live, fallbackDemo }

class TripStartResult {
  const TripStartResult({required this.mode, this.error});

  final TripConnectionMode mode;
  final String? error;
}

class TripSessionController {
  TripSessionController({
    required this.api,
    required this.locationSource,
    required this.mode,
    this.onError,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final MobilityApi api;
  final LocationSource locationSource;
  final AppMode mode;
  final void Function(String message)? onError;
  final DateTime Function() _now;

  StreamSubscription<LocationSample>? _locationSubscription;
  StreamSubscription<Map<String, dynamic>>? _mobilitySubscription;
  String? _sessionId;
  DateTime? _lastSentAt;

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
      _lastSentAt = null;
      _locationSubscription = locationSource.locationStream.listen(
        (sample) => unawaited(_sendLocation(sample)),
        onError: (Object error, StackTrace _) => _report(error),
      );
      _mobilitySubscription = api
          .watchRoute(routeId)
          .listen(
            (_) {},
            onError: (Object error, StackTrace _) => _report(error),
          );
      return const TripStartResult(mode: TripConnectionMode.live);
    } catch (error) {
      await stop();
      return TripStartResult(
        mode: TripConnectionMode.fallbackDemo,
        error: _message(error),
      );
    }
  }

  Future<void> stop() async {
    await _locationSubscription?.cancel();
    await _mobilitySubscription?.cancel();
    _locationSubscription = null;
    _mobilitySubscription = null;
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

  Future<void> _sendLocation(LocationSample sample) async {
    final sessionId = _sessionId;
    if (sessionId == null || !_isDue(sample)) return;
    _lastSentAt = _now();
    try {
      await api.postLocation(sample.toJson(sessionId: sessionId));
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
