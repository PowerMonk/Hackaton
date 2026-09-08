class AddressSuggestion {
  const AddressSuggestion({
    required this.label,
    required this.detail,
    required this.lat,
    required this.lon,
  });

  final String label;
  final String detail;
  final double lat;
  final double lon;
}

class PlannerPlace {
  const PlannerPlace({
    required this.label,
    required this.lat,
    required this.lon,
  });

  final String label;
  final double lat;
  final double lon;

  Map<String, dynamic> toJson() => {'label': label, 'lat': lat, 'lon': lon};
}

class PlannerRequest {
  const PlannerRequest({
    required this.origin,
    required this.destination,
    required this.priority,
    required this.modes,
  });

  final PlannerPlace origin;
  final PlannerPlace destination;
  final String priority;
  final List<String> modes;

  Map<String, dynamic> toJson() => {
    'origin': origin.toJson(),
    'destination': destination.toJson(),
    'priority': priority,
    'modes': modes,
  };
}

class PlannerOption {
  const PlannerOption({
    required this.id,
    required this.durationSeconds,
    required this.walkingMeters,
    required this.routeNames,
    required this.cost,
    required this.confidence,
    required this.transfers,
    required this.provisional,
    this.warnings = const [],
  });

  final String id;
  final int durationSeconds;
  final int walkingMeters;
  final List<String> routeNames;
  final double cost;
  final String confidence;
  final int transfers;
  final bool provisional;
  final List<String> warnings;

  int get durationMinutes =>
      (durationSeconds / 60).round().clamp(1, 9999).toInt();

  int get walkingMinutes => (walkingMeters / 83.33).round();

  String get routeLabel =>
      routeNames.isEmpty ? 'A pie' : routeNames.join(' + ');

  String get costLabel =>
      cost <= 0 ? 'Gratis' : '\$${cost.toStringAsFixed(0)} est.';

  factory PlannerOption.fromJson(
    Map<String, dynamic> json, {
    String fallbackConfidence = 'low',
    List<String> fallbackWarnings = const [],
  }) {
    final legs = _maps(json['legs']);
    final routeNames = <String>[];
    final routeIds = _strings(json['routeIds']);
    for (final leg in legs) {
      final routeName = leg['routeName'];
      if (routeName is String && routeName.trim().isNotEmpty) {
        routeNames.add(routeName.trim());
      }
    }
    if (routeNames.isEmpty) routeNames.addAll(routeIds);

    final duration = _number(
      json['totalDurationSeconds'] ?? json['durationSeconds'],
    );
    final walking = _number(json['totalWalkingMeters']);
    final derivedWalking = walking > 0
        ? walking
        : legs
              .where((leg) => leg['mode'] == 'walk')
              .fold<double>(
                0,
                (sum, leg) => sum + _number(leg['distanceMeters']),
              );

    return PlannerOption(
      id: json['id'] as String? ?? 'plan-${routeNames.join('-')}',
      durationSeconds: duration.round(),
      walkingMeters: derivedWalking.round(),
      routeNames: List.unmodifiable(routeNames),
      cost: _number(json['estimatedCost']),
      confidence: json['confidence'] as String? ?? fallbackConfidence,
      transfers: (_number(json['transfers'])).round(),
      provisional: json['provisional'] != false,
      warnings: {...fallbackWarnings, ..._strings(json['warnings'])}.toList(),
    );
  }
}

class PlannerResult {
  const PlannerResult({
    required this.recommended,
    required this.alternatives,
    required this.warnings,
    required this.source,
    required this.fallback,
  });

  final PlannerOption? recommended;
  final List<PlannerOption> alternatives;
  final List<String> warnings;
  final String source;
  final bool fallback;

  factory PlannerResult.fromJson(Map<String, dynamic> json) {
    final metadata = json['metadata'] is Map
        ? (json['metadata'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    final metadataWarnings = _strings(metadata['warnings']);
    final topWarnings = _strings(json['warnings']);
    final confidence = metadata['confidence'] as String? ?? 'low';
    final planMaps = _maps(json['plans']);
    final recommendedJson = json['recommended'] is Map
        ? (json['recommended'] as Map).cast<String, dynamic>()
        : null;
    final legacyPlan =
        recommendedJson == null &&
        (json.containsKey('legs') || json.containsKey('totalDurationSeconds'));
    final recommended = recommendedJson != null
        ? PlannerOption.fromJson(
            recommendedJson,
            fallbackConfidence: confidence,
            fallbackWarnings: metadataWarnings,
          )
        : legacyPlan
        ? PlannerOption.fromJson(
            json,
            fallbackConfidence: confidence,
            fallbackWarnings: metadataWarnings,
          )
        : planMaps.isNotEmpty
        ? PlannerOption.fromJson(
            planMaps.first,
            fallbackConfidence: confidence,
            fallbackWarnings: metadataWarnings,
          )
        : null;

    final alternativeMaps = _maps(json['alternatives']);
    final alternatives = alternativeMaps.isNotEmpty
        ? alternativeMaps
              .map(
                (plan) => PlannerOption.fromJson(
                  plan,
                  fallbackConfidence: confidence,
                  fallbackWarnings: metadataWarnings,
                ),
              )
              .toList()
        : planMaps
              .where(
                (plan) => recommended == null || plan['id'] != recommended.id,
              )
              .map(
                (plan) => PlannerOption.fromJson(
                  plan,
                  fallbackConfidence: confidence,
                  fallbackWarnings: metadataWarnings,
                ),
              )
              .toList();

    return PlannerResult(
      recommended: recommended,
      alternatives: alternatives,
      warnings: {...metadataWarnings, ...topWarnings}.toList(),
      source:
          metadata['source'] as String? ?? json['provider'] as String? ?? 'api',
      fallback: metadata['fallbackUsed'] == true,
    );
  }
}

List<Map<String, dynamic>> _maps(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}

List<String> _strings(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<String>()
      .where((item) => item.trim().isNotEmpty)
      .toList();
}

double _number(Object? value) {
  if (value is num && value.isFinite) return value.toDouble();
  return 0;
}
