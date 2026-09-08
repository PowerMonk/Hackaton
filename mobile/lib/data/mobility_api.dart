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
  Future<List<Map<String, dynamic>>> autocomplete(
    String query, {
    int limit = 5,
  }) async {
    final body = await _jsonRequest(
      () => _client.get(
        _endpoint('/geocoding/autocomplete').replace(
          queryParameters: {'q': query, 'limit': '$limit'},
        ),
      ),
    );
    return _mapList(body['suggestions']);
  }

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
  Future<Map<String, dynamic>> postLocation(Map<String, dynamic> sample) =>
      _jsonRequest(
        () => _client.post(
          _endpoint('/locations'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(sample),
        ),
      );

  @override
  Stream<Map<String, dynamic>> watchRoute(String routeId) {
    return _reconnectingWebSocketStream(routeId);
  }

  /// Creates a WebSocket stream with automatic reconnection.
  Stream<Map<String, dynamic>> _reconnectingWebSocketStream(String routeId) async* {
    const maxRetries = 5;
    const initialBackoff = Duration(seconds: 1);
    const maxBackoff = Duration(seconds: 30);

    int retryCount = 0;
    Duration backoff = initialBackoff;

    while (true) {
      try {
        final socket = await _webSocketConnector(
          _baseUri.replace(
            scheme: _baseUri.scheme == 'https' ? 'wss' : 'ws',
            path: '/ws/mobility',
            query: '',
          ),
        );

        // Reset retry count on successful connection
        retryCount = 0;
        backoff = initialBackoff;

        // Subscribe to route
        socket.add(jsonEncode({'type': 'subscribe', 'routeId': routeId}));

        try {
          await for (final message in socket) {
            final decoded = jsonDecode(message.toString());
            if (decoded is Map) {
              final data = decoded.cast<String, dynamic>();
              final type = data['type'] as String?;

              // Handle both vehicle_update and vehicle_snapshot
              if (type == 'vehicle_update' || type == 'vehicle_snapshot') {
                yield data;
              } else if (type == 'connected' || type == 'subscribed') {
                // Connection/subscription confirmations - can yield for logging
                yield data;
              } else if (type == 'pong') {
                // Heartbeat response - ignore
              } else if (type == 'error') {
                // Server error
                final payload = data['payload'] as Map<String, dynamic>?;
                throw MobilityApiException(
                  payload?['message'] as String? ?? 'WebSocket error',
                );
              }
            }
          }
        } finally {
          await socket.close();
        }

        // If we get here, socket closed normally - break the loop
        break;
      } catch (e) {
        retryCount++;
        if (retryCount > maxRetries) {
          // Max retries exceeded, give up
          throw MobilityApiException(
            'WebSocket connection failed after $maxRetries retries: $e',
          );
        }

        // Wait before retrying with exponential backoff
        await Future<void>.delayed(backoff);
        backoff = Duration(
          milliseconds: (backoff.inMilliseconds * 2).clamp(
            initialBackoff.inMilliseconds,
            maxBackoff.inMilliseconds,
          ),
        );
      }
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
