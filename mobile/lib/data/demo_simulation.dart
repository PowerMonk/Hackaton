import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// Simulación determinista local (DEMO_MODE) sobre la polilínea real.
///
/// En v0.1 no hay backend ni GPS: la "unidad" avanza a velocidad constante
/// con una seed fija para que el demo sea repetible (idea de `/Simulacion`
/// en context.md). El backend Bun/PostGIS reemplazará esto con
/// vehículos virtuales reales sin cambiar la UI.
class DemoSimulation {
  DemoSimulation({this.speedKmh = 20, this.seed = 42});

  /// Velocidad media simulada (tráfico Morelia centro).
  final double speedKmh;
  final int seed;

  static const _dist = Distance();

  /// Posición interpolada en [0..1] de progreso sobre [poly].
  LatLng positionAt(List<LatLng> poly, double progress) {
    if (poly.length < 2) return poly.first;
    final p = progress.clamp(0.0, 1.0);
    final total = _totalLength(poly);
    var target = total * p;
    for (var i = 0; i < poly.length - 1; i++) {
      final seg = _dist(poly[i], poly[i + 1]).toDouble();
      if (target <= seg || i == poly.length - 2) {
        final t = seg == 0 ? 0.0 : (target / seg).clamp(0.0, 1.0);
        // Ruido determinista pequeño (±8m) para no parecer línea perfecta.
        final jitter = _jitter(i);
        return LatLng(
          poly[i].latitude + (poly[i + 1].latitude - poly[i].latitude) * t + jitter.$1,
          poly[i].longitude +
              (poly[i + 1].longitude - poly[i].longitude) * t +
              jitter.$2,
        );
      }
      target -= seg;
    }
    return poly.last;
  }

  /// ETA local como rango ("4-6 min") cuando la confianza es baja.
  /// Fórmula v0.1: distancia_restante / velocidad_suavizada + dwell.
  EtaLocal etaFor(List<LatLng> poly, double progress) {
    final total = _totalLength(poly);
    final remainingM = total * (1.0 - progress.clamp(0.0, 1.0));
    final speedMs = speedKmh / 3.6;
    final dwellMin = 0.5 * _remainingStops(progress);
    final mins = remainingM / speedMs / 60.0 + dwellMin;
    if (mins < 2) return EtaLocal(label: '1-2 min', confianza: 'Alta');
    final lo = mins.floor();
    return EtaLocal(label: '$lo-${lo + 2} min', confianza: 'Media');
  }

  double _totalLength(List<LatLng> poly) {
    var total = 0.0;
    for (var i = 0; i < poly.length - 1; i++) {
      total += _dist(poly[i], poly[i + 1]).toDouble();
    }
    return total;
  }

  int _remainingStops(double progress) =>
      ((1.0 - progress.clamp(0.0, 1.0)) * 6).ceil();

  (double, double) _jitter(int i) {
    // LCG mínimo determinista con seed fija (no criptográfico).
    final x = math.sin(seed * 999.0 + i * 78.233) * 43758.5453;
    final frac = x - x.floor();
    final y = math.sin(seed * 371.0 + i * 39.425) * 24634.6345;
    final fracy = y - y.floor();
    return ((frac - 0.5) * 0.00015, (fracy - 0.5) * 0.00015);
  }
}

class EtaLocal {
  const EtaLocal({required this.label, required this.confianza});
  final String label;
  final String confianza;
}
