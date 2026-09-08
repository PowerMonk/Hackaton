import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../data/api_contracts.dart';
import '../data/location_source.dart';
import '../data/place_picker_logic.dart';
import '../models/planner_models.dart';
import '../theme/app_theme.dart';

/// Map-based place selection. Reverse geocoding is online; the map remains
/// usable offline and returns coordinates even when the address lookup fails.
class PlacePickerScreen extends StatefulWidget {
  const PlacePickerScreen({
    required this.api,
    required this.title,
    this.initialPosition = const LatLng(19.7029, -101.1921),
    this.initialLabel,
    super.key,
  });

  final MobilityApi api;
  final String title;
  final LatLng initialPosition;
  final String? initialLabel;

  @override
  State<PlacePickerScreen> createState() => _PlacePickerScreenState();
}

class _PlacePickerScreenState extends State<PlacePickerScreen> {
  late LatLng _center;
  Timer? _debounce;
  List<AddressSuggestion> _suggestions = const [];
  bool _isLoading = false;
  String? _label;
  final _searchController = TextEditingController();
  final _mapController = MapController();
  static const isFlutterTest = bool.fromEnvironment('FLUTTER_TEST');

  @override
  void initState() {
    super.initState();
    _center = widget.initialPosition;
    _label = widget.initialLabel;
    _reverseGeocode(_center);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onMapMoved(MapCamera camera, bool hasGesture) {
    _center = camera.center;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 550), () {
      _reverseGeocode(_center);
    });
  }

  Future<void> _reverseGeocode(LatLng point) async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final result = await widget.api.reverseGeocode(
        point.latitude,
        point.longitude,
      );
      if (!mounted || point != _center) return;
      final label = result['label'] ?? result['formatted'] ?? result['name'];
      setState(() {
        _label = label is String && label.trim().isNotEmpty
            ? label.trim()
            : 'Ubicación seleccionada';
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _search(String query) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) {
      setState(() => _suggestions = const []);
      return;
    }
    try {
      final rows = await widget.api.autocomplete(trimmed, limit: 6);
      if (!mounted || _searchController.text.trim() != trimmed) return;
      setState(() {
        _suggestions = rows
            .map(addressSuggestionFromJson)
            .whereType<AddressSuggestion>()
            .where(
              (suggestion) =>
                  !('${suggestion.label} ${suggestion.detail}'.toLowerCase())
                      .contains('parada'),
            )
            .toList();
      });
    } catch (_) {
      if (mounted) setState(() => _suggestions = const []);
    }
  }

  Future<void> _useCurrentLocation() async {
    try {
      if (isFlutterTest) return;
      final permission = await GeolocatorLocationSource().requestPermission();
      if (permission != LocationPermissionState.granted) return;
      final sample = await GeolocatorLocationSource().getCurrentLocation();
      if (sample == null || !mounted) return;
      final point = LatLng(sample.latitude, sample.longitude);
      setState(() => _center = point);
      _mapController.move(point, 15);
      _reverseGeocode(point);
    } catch (_) {
      // Manual map placement is always available when location is unavailable.
    }
  }

  void _selectSuggestion(AddressSuggestion suggestion) {
    setState(() {
      _center = LatLng(suggestion.lat, suggestion.lon);
      _label = suggestion.label;
      _suggestions = const [];
      _searchController.clear();
    });
    _mapController.move(_center, 15);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.title),
      actions: [
        IconButton(
          onPressed: _useCurrentLocation,
          tooltip: 'Usar mi ubicación',
          icon: const Icon(Icons.my_location),
        ),
      ],
    ),
    body: Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _center,
            initialZoom: 14.5,
            minZoom: 11,
            maxZoom: 19,
            onPositionChanged: _onMapMoved,
          ),
          children: [
            if (!isFlutterTest)
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.example.morelia_conecta',
              ),
            RichAttributionWidget(
              attributions: [
                TextSourceAttribution('OpenStreetMap contributors'),
              ],
            ),
          ],
        ),
        const Center(
          child: IgnorePointer(
            child: Icon(
              Icons.location_pin,
              color: AppColors.terracotta,
              size: 52,
            ),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          top: 16,
          child: Column(
            children: [
              Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(16),
                child: TextField(
                  controller: _searchController,
                  onChanged: _search,
                  decoration: const InputDecoration(
                    hintText: 'Busca una dirección o lugar',
                    prefixIcon: Icon(Icons.search),
                    filled: true,
                    fillColor: Colors.white,
                    border: InputBorder.none,
                  ),
                ),
              ),
              if (_suggestions.isNotEmpty)
                Material(
                  elevation: 4,
                  borderRadius: BorderRadius.circular(14),
                  child: Column(
                    children: _suggestions
                        .map(
                          (item) => ListTile(
                            title: Text(item.label),
                            subtitle: Text(item.detail),
                            onTap: () => _selectSuggestion(item),
                          ),
                        )
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 20,
          child: Material(
            elevation: 5,
            borderRadius: BorderRadius.circular(20),
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _isLoading
                        ? 'Buscando dirección...'
                        : (_label ?? 'Mueve el mapa para elegir'),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => Navigator.of(context).pop(
                        AddressSuggestion(
                          label: _label ?? 'Ubicación seleccionada',
                          detail: 'Ubicación en el mapa',
                          lat: _center.latitude,
                          lon: _center.longitude,
                        ),
                      ),
                      icon: const Icon(Icons.check),
                      label: const Text('Confirmar ubicación'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
