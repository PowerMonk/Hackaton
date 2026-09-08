import '../models/planner_models.dart';

AddressSuggestion? addressSuggestionFromJson(Map<String, dynamic> row) {
  final label = row['label'];
  final lat = row['lat'];
  final lon = row['lon'];
  if (label is! String || lat is! num || lon is! num) return null;
  return AddressSuggestion(
    label: label,
    detail: row['city'] as String? ?? row['category'] as String? ?? '',
    lat: lat.toDouble(),
    lon: lon.toDouble(),
  );
}
