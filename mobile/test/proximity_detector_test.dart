import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:morelia_conecta/data/proximity_detector.dart';
import 'package:morelia_conecta/data/routes_repository.dart';
import 'package:morelia_conecta/data/trip_session.dart';
import 'package:morelia_conecta/models/app_models.dart';

void main() {
  test('detecta una unidad próxima en la parada y respeta cooldown', () {
    final route = TransitRoute(
      id: 'R1',
      name: 'Ruta Centro',
      mode: 'Combi',
      frequency: 'Estimado',
      eta: '—',
      color: const Color(0xFF000000),
      status: RouteStatus.active,
      polyline: const [
        LatLng(19.7000, -101.1900),
        LatLng(19.7010, -101.1900),
        LatLng(19.7020, -101.1900),
      ],
    );
    final stop = const StopWithCoords(
      id: 'stop-1',
      name: 'Parada Centro',
      position: LatLng(19.7010, -101.1900),
    );
    final detector = ProximityDetector(
      route: route,
      stops: [stop],
      config: const ProximityDetectorConfig(
        vehicleApproachMeters: 300,
        promptCooldown: Duration(minutes: 1),
      ),
    );
    final vehicle = VehicleUpdate(
      id: 'v1',
      routeId: 'R1',
      progress: 0.45,
      speed: 18,
      heading: 0,
      passengerCount: 2,
      confidence: 'Media',
      lat: 19.7008,
      lon: -101.1900,
      lastUpdateAt: DateTime(2026, 1, 1),
      isSimulated: true,
    );

    final first = detector.evaluate(
      userPosition: stop.position,
      vehicles: [vehicle],
      now: DateTime(2026, 1, 1),
    );
    final second = detector.evaluate(
      userPosition: stop.position,
      vehicles: [vehicle],
      now: DateTime(2026, 1, 1, 0, 0, 10),
    );

    expect(first.primaryEvent?.type, 'boarding_likely');
    expect(second.primaryEvent?.type, 'at_stop');
  });
}
