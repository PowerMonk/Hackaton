import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:morelia_conecta/data/mobility_api.dart';
import 'package:morelia_conecta/models/planner_models.dart';

void main() {
  test('HttpMobilityApi sends a typed-compatible route plan request', () async {
    final client = RecordingClient({'provider': 'mock'});
    final api = HttpMobilityApi(
      client: client,
      baseUri: Uri.parse('http://localhost:3000'),
    );

    const request = PlannerRequest(
      origin: PlannerPlace(label: 'Origen', lat: 19.7, lon: -101.19),
      destination: PlannerPlace(label: 'Destino', lat: 19.67, lon: -101.14),
      priority: 'least_walking',
      modes: ['walk', 'transit'],
    );

    await api.planRoute(request.toJson());

    expect(client.lastRequest.method, 'POST');
    expect(client.lastRequest.url.path, '/route-plans');
    expect(jsonDecode(client.lastRequest.body), request.toJson());
  });

  test('normaliza respuesta enriquecida con recomendada y alternativas', () {
    final result = PlannerResult.fromJson({
      'recommended': {
        'id': 'transit-r12',
        'totalDurationSeconds': 1920,
        'totalWalkingMeters': 500,
        'routeIds': ['R12'],
        'estimatedCost': 11,
        'confidence': 'medium',
        'transfers': 0,
        'provisional': true,
      },
      'alternatives': [
        {
          'id': 'walk-direct',
          'totalDurationSeconds': 2700,
          'totalWalkingMeters': 2100,
          'estimatedCost': 0,
          'confidence': 'low',
        },
      ],
      'metadata': {
        'source': 'provisional',
        'confidence': 'low',
        'warnings': ['No hay horarios oficiales.'],
      },
    });

    expect(result.recommended?.durationMinutes, 32);
    expect(result.recommended?.routeLabel, 'R12');
    expect(result.recommended?.costLabel, '\$11 est.');
    expect(result.alternatives, hasLength(1));
    expect(result.warnings, contains('No hay horarios oficiales.'));
  });
}

class RecordingClient extends http.BaseClient {
  RecordingClient(this.response);

  final Map<String, dynamic> response;
  late http.Request lastRequest;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    lastRequest = request as http.Request;
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(response))),
      200,
      request: request,
    );
  }
}
