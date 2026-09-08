import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:morelia_conecta/data/api_contracts.dart';
import 'package:morelia_conecta/data/location_source.dart';
import 'package:morelia_conecta/data/trip_session.dart';
import 'package:morelia_conecta/models/mobility_models.dart';

void main() {
  test('serializa una muestra de ubicación con el contrato del backend', () {
    final sample = LocationSample(
      timestamp: DateTime.fromMillisecondsSinceEpoch(1700000000000),
      latitude: 19.70234,
      longitude: -101.18492,
      accuracy: 8,
      speed: 3.2,
      heading: 91,
    );

    expect(sample.toJson(sessionId: 'session-1'), {
      'sessionId': 'session-1',
      'timestamp': 1700000000000,
      'lat': 19.70234,
      'lon': -101.18492,
      'accuracy': 8,
      'speed': 3.2,
      'heading': 91,
      'isSimulated': false,
    });
  });

  test(
    'abre sesión y envía ubicación con muestreo adaptativo usando fakes',
    () async {
      final source = FakeLocationSource();
      final api = FakeMobilityApi();
      var now = DateTime(2026, 1, 1);
      final session = TripSessionController(
        api: api,
        locationSource: source,
        mode: AppMode.live,
        now: () => now,
      );

      final result = await session.start('R12');
      expect(result.mode, TripConnectionMode.live);
      expect(api.openedRoute, 'R12');

      source.samples.add(_sample(speed: 0));
      await pumpEventQueue();
      expect(api.locations, hasLength(1));

      now = now.add(const Duration(seconds: 44));
      source.samples.add(_sample(speed: 0));
      await pumpEventQueue();
      expect(api.locations, hasLength(1));

      now = now.add(const Duration(seconds: 1));
      source.samples.add(_sample(speed: 0));
      await pumpEventQueue();
      expect(api.locations, hasLength(2));

      await session.stop();
      expect(api.closedSession, 'session-1');
      expect(source.stopCalls, 2);
      await source.samples.close();
    },
  );

  test('permiso denegado cae a DEMO sin abrir sesión', () async {
    final source = FakeLocationSource(
      permission: LocationPermissionState.denied,
    );
    final api = FakeMobilityApi();
    final session = TripSessionController(
      api: api,
      locationSource: source,
      mode: AppMode.live,
    );

    final result = await session.start('R12');

    expect(result.mode, TripConnectionMode.fallbackDemo);
    expect(result.error, contains('denegado'));
    expect(api.openedRoute, isNull);
  });

  test('normaliza mensajes del stream de movilidad', () {
    final update = MobilityUpdate.fromJson({
      'type': 'vehicle_update',
      'payload': {'vehicles': <Map<String, Object>>[]},
    });

    expect(update.type, 'vehicle_update');
    expect(update.payload['vehicles'], isEmpty);
  });
}

LocationSample _sample({required double speed}) => LocationSample(
  timestamp: DateTime(2026, 1, 1),
  latitude: 19.70234,
  longitude: -101.18492,
  accuracy: 8,
  speed: speed,
);

class FakeLocationSource implements LocationSource {
  FakeLocationSource({this.permission = LocationPermissionState.granted});

  final LocationPermissionState permission;
  final samples = StreamController<LocationSample>.broadcast();
  var stopCalls = 0;

  @override
  Future<LocationPermissionState> requestPermission() async => permission;

  @override
  Future<LocationSample?> getCurrentLocation() async => null;

  @override
  Stream<LocationSample> get locationStream => samples.stream;

  @override
  Future<void> stop() async {
    stopCalls++;
  }
}

class FakeMobilityApi implements MobilityApi {
  String? openedRoute;
  String? closedSession;
  final locations = <Map<String, dynamic>>[];

  @override
  Future<List<Map<String, dynamic>>> getRoutes() async => const [];

  @override
  Future<Map<String, dynamic>> getRoute(String routeId) async => {
    'id': routeId,
  };

  @override
  Future<List<Map<String, dynamic>>> getVehicles(String routeId) async =>
      const [];

  @override
  Future<Map<String, dynamic>> getEta(String stopId) async => const {};

  @override
  Future<String> openBoardingSession(String routeId) async {
    openedRoute = routeId;
    return 'session-1';
  }

  @override
  Future<void> closeBoardingSession(String sessionId) async {
    closedSession = sessionId;
  }

  @override
  Future<void> postLocation(Map<String, dynamic> sample) async {
    locations.add(sample);
  }

  @override
  Stream<Map<String, dynamic>> watchRoute(String routeId) =>
      const Stream.empty();
}
