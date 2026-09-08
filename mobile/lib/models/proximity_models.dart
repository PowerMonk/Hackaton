/// Models for proximity detection and boarding state.

class NearbyStop {
  const NearbyStop({
    required this.id,
    this.name,
    required this.distanceMeters,
    required this.routeIds,
  });

  final String id;
  final String? name;
  final double distanceMeters;
  final List<String> routeIds;

  factory NearbyStop.fromJson(Map<String, dynamic> json) => NearbyStop(
    id: json['id'] as String,
    name: json['name'] as String?,
    distanceMeters: (json['distanceMeters'] as num).toDouble(),
    routeIds: (json['routeIds'] as List<dynamic>?)
        ?.map((e) => e as String)
        .toList() ?? [],
  );
}

class ProximityEvent {
  const ProximityEvent({
    required this.type,
    this.stopId,
    this.stopName,
    this.routeId,
    required this.confidence,
    required this.message,
    required this.timestamp,
  });

  final String type; // near_stop, at_stop, boarding_likely, on_vehicle, alighting_likely
  final String? stopId;
  final String? stopName;
  final String? routeId;
  final String confidence;
  final String message;
  final DateTime timestamp;

  factory ProximityEvent.fromJson(Map<String, dynamic> json) => ProximityEvent(
    type: json['type'] as String,
    stopId: json['stopId'] as String?,
    stopName: json['stopName'] as String?,
    routeId: json['routeId'] as String?,
    confidence: json['confidence'] as String,
    message: json['message'] as String,
    timestamp: DateTime.parse(json['timestamp'] as String),
  );

  bool get isAtStop => type == 'at_stop';
  bool get isNearStop => type == 'near_stop';
  bool get isBoardingLikely => type == 'boarding_likely';
  bool get isOnVehicle => type == 'on_vehicle';
  bool get isAlightingLikely => type == 'alighting_likely';
}

class ProximityNotification {
  const ProximityNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.priority,
    required this.data,
  });

  final String id;
  final String type; // boarding_prompt, destination_alert, stop_approaching, transfer_reminder
  final String title;
  final String body;
  final String priority;
  final Map<String, dynamic> data;

  factory ProximityNotification.fromJson(Map<String, dynamic> json) =>
      ProximityNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        priority: json['priority'] as String,
        data: json['data'] as Map<String, dynamic>? ?? {},
      );

  bool get isHighPriority => priority == 'high';
  bool get isBoardingPrompt => type == 'boarding_prompt';
  bool get isDestinationAlert => type == 'destination_alert';
}

class BoardingState {
  const BoardingState({
    required this.isNearStop,
    required this.isOnVehicle,
    required this.nearbyStops,
    this.currentRouteId,
    this.routeProgress,
    this.lastStopId,
    this.boardedAt,
    required this.events,
    required this.notifications,
  });

  final bool isNearStop;
  final bool isOnVehicle;
  final List<NearbyStop> nearbyStops;
  final String? currentRouteId;
  final double? routeProgress;
  final String? lastStopId;
  final DateTime? boardedAt;
  final List<ProximityEvent> events;
  final List<ProximityNotification> notifications;

  factory BoardingState.fromJson(Map<String, dynamic> json) => BoardingState(
    isNearStop: json['isNearStop'] as bool? ?? false,
    isOnVehicle: json['isOnVehicle'] as bool? ?? false,
    nearbyStops: (json['nearbyStops'] as List<dynamic>?)
        ?.map((e) => NearbyStop.fromJson(e as Map<String, dynamic>))
        .toList() ?? [],
    currentRouteId: json['currentRouteId'] as String?,
    routeProgress: (json['routeProgress'] as num?)?.toDouble(),
    lastStopId: json['lastStopId'] as String?,
    boardedAt: json['boardedAt'] != null
        ? DateTime.parse(json['boardedAt'] as String)
        : null,
    events: (json['events'] as List<dynamic>?)
        ?.map((e) => ProximityEvent.fromJson(e as Map<String, dynamic>))
        .toList() ?? [],
    notifications: (json['notifications'] as List<dynamic>?)
        ?.map((e) => ProximityNotification.fromJson(e as Map<String, dynamic>))
        .toList() ?? [],
  );

  static const empty = BoardingState(
    isNearStop: false,
    isOnVehicle: false,
    nearbyStops: [],
    events: [],
    notifications: [],
  );

  /// Get the most important event for display.
  ProximityEvent? get primaryEvent {
    // Priority: on_vehicle > at_stop > boarding_likely > near_stop > alighting_likely
    for (final type in ['on_vehicle', 'at_stop', 'boarding_likely', 'near_stop', 'alighting_likely']) {
      final event = events.firstWhere((e) => e.type == type, orElse: () => events.first);
      if (event.type == type) return event;
    }
    return events.isNotEmpty ? events.first : null;
  }

  /// Get the closest stop.
  NearbyStop? get closestStop => nearbyStops.isNotEmpty ? nearbyStops.first : null;

  /// Progress as percentage (0-100).
  int get progressPercent => routeProgress != null ? (routeProgress! * 100).round() : 0;
}
