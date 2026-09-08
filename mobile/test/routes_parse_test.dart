import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:morelia_conecta/data/routes_repository.dart';

void main() {
  test('parsea dataset OSM completo de Morelia', () {
    final raw = File('assets/geojson/rutas_morelia.geojson').readAsStringSync();
    final routes = RoutesRepository.parseRoutesJson(raw);
    expect(routes.length, 124);
    expect(routes.every((r) => r.tieneGeometriaReal), isTrue);
    expect(routes.any((r) => r.name == 'Gris 4'), isTrue);
    expect(routes.any((r) => r.id == 'Amarilla 2'), isTrue);
    expect(
      RoutesRepository.search(routes, 'soriana').single.name,
      'Azul A Soriana-CBTA',
    );
  });
}
