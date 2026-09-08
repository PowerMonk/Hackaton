class LocationSample {
  const LocationSample({
    required this.timestamp,
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    this.speed,
    this.heading,
  });

  final DateTime timestamp;
  final double latitude;
  final double longitude;
  final double accuracy;
  final double? speed;
  final double? heading;

  Map<String, dynamic> toJson({required String sessionId}) => {
    'sessionId': sessionId,
    'timestamp': timestamp.millisecondsSinceEpoch,
    'lat': latitude,
    'lon': longitude,
    'accuracy': accuracy,
    if (speed != null) 'speed': speed,
    if (heading != null) 'heading': heading,
    'isSimulated': false,
  };
}

class MobilityUpdate {
  const MobilityUpdate({required this.type, required this.payload});

  final String type;
  final Map<String, dynamic> payload;

  factory MobilityUpdate.fromJson(Map<String, dynamic> json) => MobilityUpdate(
    type: json['type'] as String? ?? 'unknown',
    payload: (json['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
  );
}
