import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:morelia_conecta/data/eta_engine.dart';
import 'package:morelia_conecta/data/trip_session.dart';
import 'package:morelia_conecta/models/app_models.dart';

void main() {
  const route = TransitRoute(
    id: 'R1',
    name: 'Ruta 1',
    mode: 'Combi',
    frequency: '10 min',
    eta: '4-6 min',
    color: Color(0xFF000000),
    status: RouteStatus.active,
    polyline: [LatLng(19.70, -101.19), LatLng(19.71, -101.19)],
  );

  VehicleUpdate vehicle({required String routeId, required double progress}) =>
      VehicleUpdate(
        id: 'v1',
        routeId: routeId,
        progress: progress,
        speed: 20,
        heading: 0,
        passengerCount: 2,
        confidence: 'Alta',
        lat: 19.705,
        lon: -101.19,
        lastUpdateAt: DateTime(2026),
        isSimulated: false,
      );

  test('projects the user and selects the closest vehicle ahead', () {
    final eta = EtaEngine.forRoute(
      route: route,
      userPosition: const LatLng(19.704, -101.19),
      vehicles: [
        vehicle(routeId: 'other', progress: 0.45),
        vehicle(routeId: 'R1', progress: 0.25),
      ],
    );

    expect(eta.label, '1 min');
    expect(eta.confianza, 'Alta');
  });

  test('ignora una unidad que ya paso al usuario', () {
    final eta = EtaEngine.forRoute(
      route: route,
      userPosition: const LatLng(19.704, -101.19),
      vehicles: [vehicle(routeId: 'R1', progress: 0.8)],
    );

    expect(eta.label, '4-6 min');
  });

  test('ignora una unidad que circula en sentido contrario', () {
    final reverseVehicle = VehicleUpdate(
      id: 'v-reverse',
      routeId: 'R1',
      progress: 0.35,
      speed: 20,
      heading: 180,
      passengerCount: 2,
      confidence: 'Alta',
      lat: 19.7035,
      lon: -101.19,
      lastUpdateAt: DateTime(2026),
      isSimulated: false,
    );
    final eta = EtaEngine.forRoute(
      route: route,
      userPosition: const LatLng(19.704, -101.19),
      vehicles: [reverseVehicle],
    );

    expect(eta.label, '4-6 min');
  });

  test('keeps the demo fallback when no matching vehicle exists', () {
    final eta = EtaEngine.forRoute(
      route: route,
      userPosition: const LatLng(19.704, -101.19),
      vehicles: const [],
    );

    expect(eta.label, isNotEmpty);
  });
}
