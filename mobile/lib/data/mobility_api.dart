import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'api_contracts.dart';

class ApiConfig {
  const ApiConfig._();

  /// Android emulator uses 10.0.2.2. For a physical device pass the LAN URL:
  /// --dart-define=API_BASE_URL=http://192.168.x.x:3000
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
  static const modeName = String.fromEnvironment(
    'APP_MODE',
    defaultValue: 'demo',
  );

  static AppMode get mode =>
      modeName.toLowerCase() == 'live' ? AppMode.live : AppMode.demo;

  static Uri get baseUri => Uri.parse(baseUrl);

  static Uri get mobilityWebSocketUri => baseUri.replace(
    scheme: baseUri.scheme == 'https' ? 'wss' : 'ws',
    path: '/ws/mobility',
    query: '',
  );
}

typedef WebSocketConnector = Future<WebSocket> Function(Uri uri);

class MobilityApiException implements Exception {
  const MobilityApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => 'MobilityApiException($statusCode): $message';
}

class HttpMobilityApi implements MobilityApi, RoutePlanningApi {
  HttpMobilityApi({
    http.Client? client,
    WebSocketConnector? webSocketConnector,
    String? deviceId,
    Uri? baseUri,
  }) : _client = client ?? http.Client(),
       _webSocketConnector =
           webSocketConnector ?? ((uri) => WebSocket.connect(uri.toString())),
       _deviceId =
           deviceId ?? 'flutter-${DateTime.now().millisecondsSinceEpoch}',
       _baseUri = baseUri ?? ApiConfig.baseUri;

  final http.Client _client;
  final WebSocketConnector _webSocketConnector;
  final String _deviceId;
  final Uri _baseUri;

  Uri _endpoint(String path) => _baseUri.resolve(path);

  Future<Map<String, dynamic>> _jsonRequest(
    Future<http.Response> Function() request,
  ) async {
    final response = await request();
    Map<String, dynamic> body = const {};
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) body = decoded.cast<String, dynamic>();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw MobilityApiException(
        body['error'] as String? ?? 'Error de API (${response.statusCode})',
        statusCode: response.statusCode,
      );
    }
    return body;
  }

  @override
  Future<List<Map<String, dynamic>>> getRoutes() async {
    final body = await _jsonRequest(() => _client.get(_endpoint('/routes')));
    return _mapList(body['routes']);
  }

  @override
  Future<Map<String, dynamic>> getRoute(String routeId) => _jsonRequest(
    () => _client.get(_endpoint('/routes/${Uri.encodeComponent(routeId)}')),
  );

  @override
  Future<List<Map<String, dynamic>>> getVehicles(String routeId) async {
    final body = await _jsonRequest(
      () => _client.get(
        _endpoint('/routes/${Uri.encodeComponent(routeId)}/vehicles'),
      ),
    );
    return _mapList(body['vehicles']);
  }

  @override
  Future<Map<String, dynamic>> getEta(String stopId) => _jsonRequest(
    () => _client.get(_endpoint('/stops/${Uri.encodeComponent(stopId)}/eta')),
  );

  @override
  Future<Map<String, dynamic>> planRoute(Map<String, dynamic> request) =>
      _jsonRequest(
        () => _client.post(
          _endpoint('/route-plans'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(request),
        ),
      );

  @override
  Future<String> openBoardingSession(String routeId) async {
    final body = await _jsonRequest(
      () => _client.post(
        _endpoint('/boarding-sessions'),
        headers: {'Content-Type': 'application/json'},
         body: jsonEncode({
           'routeId': routeId,
           'deviceId': _deviceId,
           'isSimulated': false,
         }),
      ),
    );
    final sessionId = body['id'] ?? body['sessionId'];
    if (sessionId is! String || sessionId.isEmpty) {
      throw const MobilityApiException('La API no devolvió un id de sesión');
    }
    return sessionId;
  }

  @override
  Future<void> closeBoardingSession(String sessionId) async {
    await _jsonRequest(
      () => _client.delete(
        _endpoint('/boarding-sessions/${Uri.encodeComponent(sessionId)}'),
      ),
    );
  }

  @override
  Future<void> postLocation(Map<String, dynamic> sample) async {
    await _jsonRequest(
      () => _client.post(
        _endpoint('/locations'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(sample),
      ),
    );
  }

  @override
  Stream<Map<String, dynamic>> watchRoute(String routeId) async* {
    final socket = await _webSocketConnector(
      _baseUri.replace(
        scheme: _baseUri.scheme == 'https' ? 'wss' : 'ws',
        path: '/ws/mobility',
        query: '',
      ),
    );
    try {
      socket.add(jsonEncode({'type': 'subscribe', 'routeId': routeId}));
      await for (final message in socket) {
        final decoded = jsonDecode(message.toString());
        if (decoded is Map) yield decoded.cast<String, dynamic>();
      }
    } finally {
      await socket.close();
    }
  }

  static List<Map<String, dynamic>> _mapList(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }
}
