import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../data/demo_data.dart';
import '../data/eta_engine.dart';
import '../data/api_contracts.dart';
import '../data/location_source.dart';
import '../data/mobility_api.dart';
import '../data/proximity_detector.dart';
import '../data/routes_repository.dart';
import '../data/trip_session.dart';
import '../models/app_models.dart';
import '../models/mobility_models.dart';
import '../models/proximity_models.dart';
import '../theme/app_theme.dart';
import '../widgets/map_canvas.dart';
import '../widgets/proximity_banner.dart';
import '../widgets/ui_components.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({required this.onOpenService, super.key});

  final VoidCallback onOpenService;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  late final TripSessionController _tripSession;
  late final GeolocatorLocationSource _localLocationSource;
  StreamSubscription<LocationSample>? _localLocationSubscription;
  TransitRoute? selectedRoute;
  String selectedFilter = 'Cerca de mí';
  String query = '';
  List<TransitRoute> routes = demoRoutes;
  bool loadingReal = true;
  bool activeTrip = false;
  bool tripMinimized = false;
  bool routeFocused = false;
  TripConnectionMode tripConnectionMode = TripConnectionMode.demo;
  String? tripConnectionError;
  LatLng? userPosition;
  double? locationAccuracy;
  LocationPermissionState locationPermission = LocationPermissionState.denied;
  String? locationError;
  List<VehicleUpdate> _vehicles = [];
  StreamSubscription<List<VehicleUpdate>>? _vehicleSubscription;
  List<VehicleUpdate> routeVehicles = const [];
  DateTime? vehiclesUpdatedAt;
  List<StopWithCoords> _proximityStops = const [];
  BoardingState _proximityState = BoardingState.empty;
  ProximityDetector? _proximityDetector;

  @override
  void initState() {
    super.initState();
    _localLocationSource = GeolocatorLocationSource();
    _tripSession = TripSessionController(
      api: HttpMobilityApi(),
      locationSource: GeolocatorLocationSource(),
      mode: ApiConfig.mode,
      onError: _handleTripError,
      onVehicleUpdate: _handleVehicleUpdate,
      onBoardingStateUpdate: _handleBoardingState,
    );
    _loadRealRoutes();
    unawaited(_startLocalLocation());
  }

  @override
  void dispose() {
    unawaited(_localLocationSubscription?.cancel());
    unawaited(_vehicleSubscription?.cancel());
    unawaited(_localLocationSource.stop());
    unawaited(_tripSession.stop());
    _tripSession.dispose();
    super.dispose();
  }

  Future<void> _startLocalLocation() async {
    try {
      final permission = await _localLocationSource.requestPermission();
      if (!mounted) return;
      setState(() => locationPermission = permission);
      if (permission != LocationPermissionState.granted) {
        setState(() => locationError = _locationPermissionMessage(permission));
        return;
      }

      final initial = await _localLocationSource.getCurrentLocation();
      if (initial != null) _applyLocalLocation(initial);
      _localLocationSubscription = _localLocationSource.locationStream.listen(
        _applyLocalLocation,
        onError: (Object error, StackTrace _) {
          if (mounted) setState(() => locationError = error.toString());
        },
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => locationError = 'No se pudo obtener la ubicación: $error');
    }
  }

  void _applyLocalLocation(LocationSample sample) {
    if (!mounted) return;
    setState(() {
      userPosition = LatLng(sample.latitude, sample.longitude);
      locationAccuracy = sample.accuracy;
      locationError = null;
    });
    _evaluateProximity();
  }

  static String _locationPermissionMessage(LocationPermissionState state) {
    return switch (state) {
      LocationPermissionState.denied =>
        'Activa la ubicación para detectar rutas cercanas.',
      LocationPermissionState.deniedForever =>
        'La ubicación está bloqueada. Actívala desde Ajustes.',
      LocationPermissionState.serviceDisabled =>
        'Activa el GPS del teléfono para detectar rutas cercanas.',
      LocationPermissionState.granted => '',
    };
  }

  void _handleTripError(String message) {
    if (!mounted) return;
    setState(() => tripConnectionError = message);
  }

  void _handleVehicleUpdate(List<VehicleUpdate> vehicles) {
    if (!mounted) return;
    final routeId = selectedRoute?.id;
    final filteredVehicles = routeId == null
        ? vehicles
        : vehicles.where((vehicle) => vehicle.routeId == routeId).toList();
    setState(() {
      routeVehicles = routeId == null
          ? vehicles
          : vehicles.where((vehicle) => vehicle.routeId == routeId).toList();
      vehiclesUpdatedAt = DateTime.now();
    });
    _evaluateProximity(filteredVehicles);
  }

  void _handleBoardingState(BoardingState state) {
    if (!mounted) return;
    setState(() => _proximityState = state);
  }

  void _evaluateProximity([List<VehicleUpdate>? vehicles]) {
    final route = selectedRoute;
    if (route == null || _proximityStops.isEmpty) return;
    final detector = _proximityDetector ??= ProximityDetector(
      route: route,
      stops: _proximityStops,
    );
    final state = detector.evaluate(
      userPosition: userPosition,
      vehicles: vehicles ?? routeVehicles,
      isOnVehicle: activeTrip,
    );
    if (mounted) setState(() => _proximityState = state);
  }

  Future<void> _loadRealRoutes() async {
    final real = await RoutesRepository.loadDemoRoutes();
    if (!mounted) return;
    setState(() {
      routes = real;
      loadingReal = false;
      if (selectedRoute != null) {
        final match = real.where((r) => r.id == selectedRoute!.id);
        if (match.isNotEmpty) selectedRoute = match.first;
      }
    });
  }

  void _selectRoute(TransitRoute route) {
    setState(() {
      selectedRoute = route;
      routeFocused = false;
      routeVehicles = const [];
      vehiclesUpdatedAt = null;
      _proximityState = BoardingState.empty;
      _proximityStops = const [];
    });
    unawaited(_tripSession.watchRoute(route.id));
    unawaited(_loadProximityStops(route));
  }

  Future<void> _loadProximityStops(TransitRoute route) async {
    final stops = await StopsWithCoordsExtension.stopsWithCoordsFor(route);
    if (!mounted || selectedRoute?.id != route.id) return;
    setState(() => _proximityStops = stops);
    _proximityDetector = ProximityDetector(route: route, stops: stops);
    _evaluateProximity();
  }

  void _clearRouteStream() {
    routeVehicles = const [];
    vehiclesUpdatedAt = null;
    unawaited(_tripSession.stopVehicleStream());
  }

  List<TransitRoute> get visibleRoutes {
    var list = switch (selectedFilter) {
      'Combis' => routes.where((route) => route.mode == 'Combi').toList(),
      'Camiones' =>
        routes
            .where((route) => route.mode == 'Camión' || route.mode == 'Micro')
            .toList(),
      _ => List<TransitRoute>.from(routes),
    };
    list = RoutesRepository.search(list, query);
    if (selectedFilter == 'Cerca de mí' && userPosition != null) {
      final nearby =
          list
              .map(
                (route) => (
                  route: route,
                  distance: RoutesRepository.distanceToRoute(
                    userPosition!,
                    route,
                  ),
                ),
              )
              .where((item) => item.distance <= 1500)
              .toList()
            ..sort((a, b) => a.distance.compareTo(b.distance));
      return [for (final item in nearby) item.route];
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    if (activeTrip && !tripMinimized && selectedRoute != null) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) setState(() => tripMinimized = true);
        },
        child: ActiveTripView(
          route: selectedRoute!,
          userPosition: userPosition,
          locationAccuracy: locationAccuracy,
          isLiveLocation: userPosition != null,
          vehicles: _vehicles,
          lastUpdateAt: vehiclesUpdatedAt,
          connectionMode: tripConnectionMode,
          connectionError: tripConnectionError,
          proximityState: _proximityState,
          onBack: () => setState(() => tripMinimized = true),
          onExit: () => unawaited(_endTrip()),
        ),
      );
    }
    if (selectedRoute != null && routeFocused) {
      return FocusedRouteView(
        route: selectedRoute!,
        userPosition: userPosition,
        locationAccuracy: locationAccuracy,
        isLiveLocation: userPosition != null,
        vehicles: routeVehicles,
        lastUpdateAt: vehiclesUpdatedAt,
        proximityState: _proximityState,
        onConfirmBoarding: () => _showBoardingSheet(context),
        onBack: () => setState(() {
          selectedRoute = null;
          routeFocused = false;
          _clearRouteStream();
        }),
        onBoarding: () {
          if (activeTrip) {
            setState(() => tripMinimized = false);
          } else {
            _showBoardingSheet(context);
          }
        },
        onService: widget.onOpenService,
      );
    }
    if (routeFocused) {
      return MapOverviewView(
        route: routes.isNotEmpty ? routes.first : demoRoutes.first,
        userPosition: userPosition,
        locationAccuracy: locationAccuracy,
        isLiveLocation: userPosition != null,
        vehicles: routeVehicles,
        lastUpdateAt: vehiclesUpdatedAt,
        onBack: () => setState(() => routeFocused = false),
      );
    }
    return RouteSelectionView(
      selectedRoute: selectedRoute,
      selectedFilter: selectedFilter,
      routes: visibleRoutes,
      totalCount: routes.length,
      isLoadingReal: loadingReal,
      hasLocalLocation: userPosition != null,
      locationError: locationError,
      query: query,
      onQueryChanged: (q) => setState(() => query = q),
      onSelect: _selectRoute,
      onSelectFilter: (filter) => setState(() => selectedFilter = filter),
      onViewMap: () {
        setState(() => routeFocused = true);
      },
      onOpenActiveTrip: () {
        setState(() {
          selectedRoute ??= routes.first;
          if (activeTrip) {
            tripMinimized = false;
          } else {
            routeFocused = true;
          }
        });
      },
    );
  }

  Future<void> _showBoardingSheet(BuildContext context) async {
    final boarded = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => BoardingSheet(route: selectedRoute!),
    );
    if (boarded != true || !mounted) return;

    final shareLocation = ApiConfig.mode == AppMode.live
        ? await _askToShareLocation()
        : false;
    if (!mounted) return;

    final result = shareLocation
        ? await _tripSession.start(selectedRoute!.id)
        : const TripStartResult(mode: TripConnectionMode.localOnly);
    if (!mounted) return;

    // Subscribe to vehicle updates from WebSocket
    _vehicleSubscription?.cancel();
    _vehicleSubscription = _tripSession.vehicleStream.listen((vehicles) {
      if (mounted) {
        setState(() => _vehicles = vehicles);
      }
    });
    // Get initial vehicles if available
    if (_tripSession.latestVehicles.isNotEmpty) {
      _vehicles = _tripSession.latestVehicles;
    }

    setState(() {
      activeTrip = true;
      tripMinimized = false;
      tripConnectionMode = result.mode;
      tripConnectionError = result.error;
    });
    if (result.error != null) {
      ScaffoldMessenger.of(
        this.context,
      ).showSnackBar(SnackBar(content: Text(result.error!)));
    }
  }

  Future<bool> _askToShareLocation() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Compartir ubicación durante el viaje'),
        content: const Text(
          'Tu ubicación ya se usa localmente para mostrar rutas cercanas. '
          '¿Deseas compartir muestras aproximadas para calcular ETA y mejorar '
          'la información de transporte?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('No compartir'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Compartir'),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _endTrip() async {
    await _vehicleSubscription?.cancel();
    _vehicleSubscription = null;
    await _tripSession.stop();
    if (!mounted) return;
    setState(() {
      activeTrip = false;
      tripMinimized = false;
      routeFocused = selectedRoute != null;
      tripConnectionMode = TripConnectionMode.demo;
      tripConnectionError = null;
      _vehicles = [];
    });
  }
}

class RouteSelectionView extends StatelessWidget {
  const RouteSelectionView({
    required this.selectedRoute,
    required this.selectedFilter,
    required this.routes,
    required this.totalCount,
    required this.isLoadingReal,
    required this.hasLocalLocation,
    this.locationError,
    required this.query,
    required this.onQueryChanged,
    required this.onSelect,
    required this.onSelectFilter,
    required this.onViewMap,
    required this.onOpenActiveTrip,
    super.key,
  });

  final TransitRoute? selectedRoute;
  final String selectedFilter;
  final List<TransitRoute> routes;
  final int totalCount;
  final bool isLoadingReal;
  final bool hasLocalLocation;
  final String? locationError;
  final String query;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<TransitRoute> onSelect;
  final ValueChanged<String> onSelectFilter;
  final VoidCallback onViewMap;
  final VoidCallback onOpenActiveTrip;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isCompact = constraints.maxWidth < 360;
        final horizontal = isCompact ? 16.0 : 22.0;
        final subtitle =
            locationError ??
            (hasLocalLocation
                ? 'Ubicación real activa · rutas cercanas ordenadas por distancia'
                : isLoadingReal
                ? 'Sin destino obligatorio · cargando datos OSM…'
                : 'Activa la ubicación para detectar rutas cercanas · $totalCount rutas');
        return Column(
          children: [
            Expanded(
              child: Stack(
                children: [
                  CustomScrollView(
                    slivers: [
                      SliverPersistentHeader(
                        pinned: true,
                        delegate: _RouteHeaderDelegate(
                          subtitle: subtitle,
                          compact: isCompact,
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(
                            horizontal,
                            16,
                            horizontal,
                            10,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TextField(
                                onChanged: onQueryChanged,
                                decoration: InputDecoration(
                                  hintText:
                                      'Buscar por número, colonia o destino...',
                                  hintStyle: TextStyle(
                                    color: AppColors.muted,
                                    fontSize: isCompact ? 15 : 17,
                                  ),
                                  prefixIcon: Icon(
                                    Icons.search,
                                    color: AppColors.muted,
                                    size: isCompact ? 24 : 28,
                                  ),
                                  filled: true,
                                  fillColor: Colors.white,
                                  contentPadding: EdgeInsets.symmetric(
                                    vertical: isCompact ? 16 : 19,
                                    horizontal: 12,
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(22),
                                    borderSide: const BorderSide(
                                      color: AppColors.line,
                                      width: 1.5,
                                    ),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(22),
                                    borderSide: const BorderSide(
                                      color: AppColors.line,
                                      width: 1.5,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 16),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    for (final filter in const [
                                      'Cerca de mí',
                                      'Combis',
                                      'Camiones',
                                    ])
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          right: 10,
                                        ),
                                        child: _SelectableFilterChip(
                                          label: filter,
                                          selected: selectedFilter == filter,
                                          compact: isCompact,
                                          onTap: () => onSelectFilter(filter),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              InkWell(
                                onTap: onOpenActiveTrip,
                                borderRadius: BorderRadius.circular(20),
                                child: SoftCard(
                                  color: const Color(0xFFE1F4E8),
                                  borderColor: const Color(0xFF9ED5B6),
                                  padding: EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: isCompact ? 13 : 15,
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.directions_bus_filled,
                                        color: AppColors.green,
                                        size: 26,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Text(
                                          selectedRoute != null
                                              ? 'Hay una unidad simulada en ${selectedRoute!.id} · tócala para verla'
                                              : (routes.isNotEmpty
                                                    ? 'Hay unidades simuladas · elige una ruta para verla'
                                                    : 'Sin rutas para ese filtro · prueba otra búsqueda'),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: AppColors.green,
                                            fontSize: isCompact ? 15 : 16,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                      const Icon(
                                        Icons.chevron_right,
                                        color: AppColors.green,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: EdgeInsets.fromLTRB(
                          horizontal,
                          0,
                          horizontal,
                          110,
                        ),
                        sliver: routes.isEmpty
                            ? const SliverToBoxAdapter(
                                child: Padding(
                                  padding: EdgeInsets.symmetric(vertical: 30),
                                  child: Center(
                                    child: Text(
                                      'No hay rutas para este filtro.',
                                    ),
                                  ),
                                ),
                              )
                            : SliverList(
                                delegate: SliverChildBuilderDelegate(
                                  (context, index) => Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: SelectableRouteCard(
                                      route: routes[index],
                                      selected:
                                          selectedRoute?.id == routes[index].id,
                                      compact: isCompact,
                                      onTap: () => onSelect(routes[index]),
                                    ),
                                  ),
                                  childCount: routes.length,
                                ),
                              ),
                      ),
                    ],
                  ),
                  Positioned(
                    right: horizontal,
                    bottom: 16,
                    child: SafeArea(
                      top: false,
                      child: Semantics(
                        button: true,
                        label: 'Ver en el mapa',
                        child: FloatingActionButton(
                          onPressed: onViewMap,
                          tooltip: 'Ver en el mapa',
                          backgroundColor: AppColors.terracotta,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: const Icon(Icons.map_outlined),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _RouteHeaderDelegate extends SliverPersistentHeaderDelegate {
  const _RouteHeaderDelegate({required this.subtitle, required this.compact});

  final String subtitle;
  final bool compact;

  @override
  double get minExtent => compact ? 52 : 62;

  @override
  double get maxExtent => compact ? 52 : 62;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: AppColors.cream,
      padding: EdgeInsets.fromLTRB(
        compact ? 16 : 22,
        compact ? 2 : 4,
        compact ? 16 : 22,
        compact ? 2 : 4,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Elige tu ruta',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 20 : 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 10 : 12,
              color: AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _RouteHeaderDelegate oldDelegate) =>
      oldDelegate.subtitle != subtitle || oldDelegate.compact != compact;
}

class MapOverviewView extends StatelessWidget {
  const MapOverviewView({
    required this.route,
    required this.onBack,
    this.userPosition,
    this.locationAccuracy,
    this.isLiveLocation = false,
    this.vehicles = const [],
    this.lastUpdateAt,
    super.key,
  });

  final TransitRoute route;
  final VoidCallback onBack;
  final LatLng? userPosition;
  final double? locationAccuracy;
  final bool isLiveLocation;
  final List<VehicleUpdate> vehicles;
  final DateTime? lastUpdateAt;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.62,
            child: Stack(
              children: [
                Positioned.fill(
                  child: DemoMap(
                    route: route,
                    showRoute: false,
                    userPosition: userPosition,
                    locationAccuracy: locationAccuracy,
                    isLiveLocation: isLiveLocation,
                    vehicles: vehicles,
                    showFreshnessInfo: vehicles.isNotEmpty,
                    lastUpdateAt: lastUpdateAt,
                  ),
                ),
                Positioned(
                  top: 22,
                  left: 18,
                  right: 18,
                  child: SoftCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.home_rounded, color: AppColors.ink),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'Mapa de Morelia',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Elegir ruta',
                          onPressed: onBack,
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(22),
            child: SoftCard(
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.muted),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Selecciona una ruta para ver su recorrido y las unidades disponibles.',
                      style: TextStyle(color: AppColors.muted, height: 1.35),
                    ),
                  ),
                  TextButton(onPressed: onBack, child: const Text('Rutas')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SelectableRouteCard extends StatelessWidget {
  const SelectableRouteCard({
    required this.route,
    required this.selected,
    required this.onTap,
    this.compact = false,
    super.key,
  });

  final TransitRoute route;
  final bool selected;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final dark = selected;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: EdgeInsets.all(compact ? 13 : 15),
        decoration: BoxDecoration(
          color: dark ? AppColors.ink : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: dark ? AppColors.ink : AppColors.line,
            width: 1.5,
          ),
        ),
        child: Row(
          children: [
            RouteBadge(route: route, compact: true),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    route.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: dark ? Colors.white : AppColors.ink,
                      fontSize: compact ? 15 : 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${route.mode} · ${route.frequency}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: dark ? Colors.white70 : AppColors.muted,
                      fontSize: compact ? 13 : 14,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  route.eta,
                  maxLines: 1,
                  style: TextStyle(
                    color: dark ? Colors.white : AppColors.ink,
                    fontSize: compact ? 17 : 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  route.status == RouteStatus.active ? '● Activa' : 'Inactiva',
                  maxLines: 1,
                  style: TextStyle(
                    color: route.status == RouteStatus.active
                        ? (dark
                              ? const Color(0xFF8CE0B2)
                              : AppColors.greenBright)
                        : AppColors.muted,
                    fontSize: compact ? 12 : 13,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class FocusedRouteView extends StatefulWidget {
  const FocusedRouteView({
    required this.route,
    required this.onBack,
    required this.onBoarding,
    required this.onService,
    this.userPosition,
    this.locationAccuracy,
    this.isLiveLocation = false,
    this.vehicles = const [],
    this.lastUpdateAt,
    this.proximityState = BoardingState.empty,
    this.onConfirmBoarding,
    super.key,
  });

  final TransitRoute route;
  final VoidCallback onBack;
  final VoidCallback onBoarding;
  final VoidCallback onService;
  final LatLng? userPosition;
  final double? locationAccuracy;
  final bool isLiveLocation;
  final List<VehicleUpdate> vehicles;
  final DateTime? lastUpdateAt;
  final BoardingState proximityState;
  final VoidCallback? onConfirmBoarding;

  @override
  State<FocusedRouteView> createState() => _FocusedRouteViewState();
}

class _FocusedRouteViewState extends State<FocusedRouteView> {
  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 360;
    final isReal = widget.route.tieneGeometriaReal;
    final simEta = isReal
        ? EtaEngine.forRoute(
            route: widget.route,
            userPosition: widget.userPosition,
            vehicles: widget.vehicles,
          ).label
        : '4-6 min';
    return SizedBox.expand(
      child: Stack(
        children: [
          Positioned.fill(
            child: DemoMap(
              route: widget.route,
              userPosition: widget.userPosition,
              locationAccuracy: widget.locationAccuracy,
              isLiveLocation: widget.isLiveLocation,
              vehicles: widget.vehicles,
              showFreshnessInfo: widget.vehicles.isNotEmpty,
              lastUpdateAt: widget.lastUpdateAt,
            ),
          ),
          Positioned(
            top: 16,
            right: 16,
            child: SoftCard(
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 10 : 13,
                vertical: compact ? 8 : 10,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RouteBadge(route: widget.route, compact: true),
                  const SizedBox(width: 9),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 150),
                    child: Text(
                      isReal
                          ? widget.route.name
                          : '${widget.route.id} · Centro',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: compact ? 13 : 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: widget.onBack,
                    tooltip: 'Elegir otra ruta',
                    icon: const Icon(Icons.close, size: 20),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            top: compact ? 82 : 94,
            left: 16,
            child: Material(
              color: AppColors.ink,
              borderRadius: BorderRadius.circular(18),
              child: InkWell(
                onTap: widget.onBoarding,
                borderRadius: BorderRadius.circular(18),
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: compact ? 11 : 14,
                    vertical: compact ? 9 : 11,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: compact ? 32 : 38,
                        height: compact ? 32 : 38,
                        decoration: BoxDecoration(
                          color: AppColors.greenBright,
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Icon(
                          Icons.directions_bus,
                          color: Colors.white,
                          size: compact ? 18 : 21,
                        ),
                      ),
                      const SizedBox(width: 9),
                      Text(
                        'Llegada estimada $simEta',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: compact ? 13 : 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (widget.proximityState.primaryEvent != null)
            Positioned(
              left: 16,
              right: 16,
              top: compact ? 145 : 160,
              child: ProximityBanner(
                state: widget.proximityState,
                onConfirmBoarding: widget.onConfirmBoarding,
                onDismiss: () => setState(() {}),
              ),
            ),
          DraggableScrollableSheet(
            initialChildSize: 0.20,
            minChildSize: 0.16,
            maxChildSize: 0.72,
            snap: true,
            snapSizes: const [0.20, 0.48, 0.72],
            builder: (context, controller) {
              return Material(
                color: AppColors.cream,
                elevation: 14,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(28),
                ),
                clipBehavior: Clip.antiAlias,
                child: ListView(
                  controller: controller,
                  padding: const EdgeInsets.fromLTRB(22, 10, 22, 30),
                  children: [
                    Center(
                      child: Container(
                        width: 44,
                        height: 5,
                        decoration: BoxDecoration(
                          color: AppColors.line,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Abordaje flexible',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Puedes abordar en un punto seguro sobre el recorrido.',
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SoftCard(
                      padding: const EdgeInsets.all(16),
                      color: const Color(0xFFE1F4E8),
                      borderColor: const Color(0xFF9ED5B6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.signpost_outlined,
                            color: AppColors.green,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Las combis y autobuses pueden detenerse cerca de cualquier esquina. Busca una zona segura sobre la ruta y confirma cuando la unidad se aproxime.',
                              style: TextStyle(
                                color: AppColors.ink,
                                fontSize: 14,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: widget.onService,
                      icon: const Icon(Icons.wifi_off, size: 18),
                      label: const Text('Estado del servicio'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.ink,
                        minimumSize: const Size(double.infinity, 48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(15),
                        ),
                        side: const BorderSide(color: AppColors.line),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class StopTimelineItem extends StatelessWidget {
  const StopTimelineItem({required this.stop, super.key});

  final StopInfo stop;

  @override
  Widget build(BuildContext context) {
    final active = stop.kind == StopKind.current || stop.kind == StopKind.next;
    final passed = stop.kind == StopKind.passed;
    final color = stop.kind == StopKind.next
        ? AppColors.terracotta
        : AppColors.greenBright;
    return SizedBox(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 38,
            child: Column(
              children: [
                Container(
                  width: 21,
                  height: 21,
                  decoration: BoxDecoration(
                    color: passed
                        ? AppColors.greenBright
                        : (active
                              ? (stop.kind == StopKind.current
                                    ? AppColors.terracotta
                                    : Colors.transparent)
                              : AppColors.cream),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: passed ? AppColors.greenBright : color,
                      width: 3,
                    ),
                  ),
                ),
                Container(width: 2, height: 30, color: AppColors.line),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stop.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    stop.detail,
                    style: TextStyle(
                      fontSize: 13,
                      color: stop.kind == StopKind.next
                          ? AppColors.terracotta
                          : AppColors.muted,
                      fontWeight: stop.kind == StopKind.next
                          ? FontWeight.w600
                          : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (stop.eta.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.creamDark,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Text(
                stop.eta,
                style: const TextStyle(
                  color: AppColors.terracotta,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class BoardingSheet extends StatelessWidget {
  const BoardingSheet({required this.route, super.key});

  final TransitRoute route;

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.sizeOf(context).height * 0.92;
    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
      decoration: const BoxDecoration(
        color: AppColors.cream,
        borderRadius: BorderRadius.vertical(top: Radius.circular(34)),
      ),
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxWidth < 360;
            final iconSize = compact ? 84.0 : 112.0;
            final titleSize = compact ? 24.0 : 29.0;
            final subtitleSize = compact ? 19.0 : 24.0;
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 52,
                    height: 6,
                    decoration: BoxDecoration(
                      color: AppColors.line,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  SizedBox(height: compact ? 16 : 26),
                  Container(
                    width: iconSize,
                    height: iconSize,
                    decoration: BoxDecoration(
                      color: AppColors.creamDark,
                      borderRadius: BorderRadius.circular(compact ? 28 : 38),
                    ),
                    child: Icon(
                      Icons.directions_bus,
                      color: AppColors.terracotta,
                      size: compact ? 42 : 54,
                    ),
                  ),
                  SizedBox(height: compact ? 14 : 22),
                  Text(
                    'Ruta ${route.id} cerca de ti',
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: titleSize,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '¿Ya subiste al transporte?',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: subtitleSize,
                      color: AppColors.ink,
                    ),
                  ),
                  SizedBox(height: compact ? 14 : 22),
                  SoftCard(
                    color: AppColors.creamDark,
                    borderColor: AppColors.creamDark,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: const [
                            Icon(Icons.location_on_outlined, size: 22),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Villalongín · 120 m',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: 8),
                        Row(
                          children: const [
                            Icon(Icons.navigation_outlined, size: 22),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Unidad a ~350 m',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Divider(height: 24),
                        Row(
                          children: const [
                            Flexible(
                              child: StatusPill(
                                label: 'Alta confianza',
                                color: AppColors.green,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: compact ? 14 : 20),
                  const Text(
                    'Si confirmas, ayudas a mejorar los tiempos de llegada para otras personas. Sin presión: solo confirma si ya abordaste.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.45,
                      color: Color(0xFF40506A),
                    ),
                  ),
                  SizedBox(height: compact ? 16 : 22),
                  PrimaryButton(
                    label: 'Sí, ya estoy a bordo',
                    icon: Icons.check,
                    onPressed: () => Navigator.pop(context, true),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context, false),
                          style: _secondaryButtonStyle(),
                          child: const Text('No subí'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context, false),
                          style: _secondaryButtonStyle(),
                          child: const Text('Ahora no'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class ActiveTripView extends StatelessWidget {
  const ActiveTripView({
    required this.route,
    required this.connectionMode,
    this.userPosition,
    this.locationAccuracy,
    this.isLiveLocation = false,
    this.vehicles = const [],
    this.lastUpdateAt,
    required this.onExit,
    required this.onBack,
    this.connectionError,
    this.proximityState = BoardingState.empty,
    super.key,
  });

  final TransitRoute route;
  final TripConnectionMode connectionMode;
  final LatLng? userPosition;
  final double? locationAccuracy;
  final bool isLiveLocation;
  final List<VehicleUpdate> vehicles;
  final DateTime? lastUpdateAt;
  final String? connectionError;
  final BoardingState proximityState;
  final VoidCallback onExit;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final isLive = connectionMode == TripConnectionMode.live;
    final sharingLabel = isLive
        ? 'Compartiendo ubicación aproximada'
        : connectionMode == TripConnectionMode.localOnly
        ? 'Ubicación real · no compartida'
        : 'Modo demostración · ubicación no compartida';
    final sharingDetail =
        connectionError ??
        (isLive
            ? 'Última actualización en vivo · muestreo adaptativo'
            : connectionMode == TripConnectionMode.localOnly
            ? 'GPS activo solo en este dispositivo'
            : 'Datos locales deterministas · sin conexión al backend');
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 24, 28),
            color: AppColors.green,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: onBack,
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                      tooltip: 'Volver al mapa',
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0x22FFFFFF),
                        fixedSize: const Size(48, 48),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: StatusPill(
                        label: 'Viaje activo',
                        color: AppColors.green,
                        background: Color(0xFFE1F4E8),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isLive ? Icons.wifi : Icons.wifi_off,
                      color: Colors.white,
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    RouteBadge(route: route, large: true),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            // Use real direction if available, otherwise show "Sentido no disponible"
                            route.direction ?? 'Sentido no disponible',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: route.direction != null ? 26 : 20,
                              fontWeight: FontWeight.w800,
                              fontStyle: route.direction == null
                                  ? FontStyle.italic
                                  : FontStyle.normal,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Text(
                            // ETA is estimated, don't invent stops
                            route.tieneGeometriaReal
                                ? 'ETA estimado · ${EtaEngine.forRoute(route: route, userPosition: userPosition, vehicles: vehicles).label}'
                                : 'Sin datos de paradas',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 18,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (proximityState.primaryEvent != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: ProximityBanner(state: proximityState),
                  ),
                const SizedBox(height: 27),
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: const LinearProgressIndicator(
                    value: 0.48,
                    minHeight: 15,
                    backgroundColor: Color(0x6687C8A3),
                    valueColor: AlwaysStoppedAnimation<Color>(AppColors.cream),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Inicio',
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                    const Text(
                      'Abordaje flexible · recorrido OSM',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 16,
                      ),
                    ),
                    const Text(
                      'Fin',
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                  ],
                ),
              ],
            ),
          ),
          DemoMap(
            route: route,
            height: 390,
            showDemoLabel: !isLiveLocation && vehicles.isEmpty,
            userPosition: userPosition,
            locationAccuracy: locationAccuracy,
            isLiveLocation: isLiveLocation,
            vehicles: vehicles,
            showFreshnessInfo: vehicles.isNotEmpty,
            lastUpdateAt: vehicles.isNotEmpty
                ? vehicles.first.lastUpdateAt
                : null,
          ),
          Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              children: [
                SoftCard(
                  color: const Color(0xFFE1F4E8),
                  borderColor: const Color(0xFF9ED5B6),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.handshake_outlined,
                        color: AppColors.green,
                        size: 34,
                      ),
                      SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          'Estás ayudando a mejorar esta ruta',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Text(
                        'hace 28 s',
                        style: TextStyle(color: AppColors.muted, fontSize: 15),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SoftCard(
                  color: AppColors.creamDark,
                  borderColor: AppColors.creamDark,
                  child: Row(
                    children: [
                      const Icon(Icons.sensors_outlined, size: 30),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              sharingLabel,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              sharingDetail,
                              style: const TextStyle(
                                fontSize: 15,
                                color: Color(0xFF40506A),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.info_outline),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: SoftCard(
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Posición inferida',
                              style: TextStyle(
                                color: AppColors.muted,
                                fontSize: 15,
                              ),
                            ),
                            SizedBox(height: 8),
                            Text(
                              'Entre Villalongín y Catedral',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SoftCard(
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Muestreo',
                              style: TextStyle(
                                color: AppColors.muted,
                                fontSize: 15,
                              ),
                            ),
                            SizedBox(height: 8),
                            Text(
                              'Cada ~30 s · activo',
                              style: TextStyle(
                                fontSize: 17,
                                color: AppColors.green,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 60,
                  child: OutlinedButton.icon(
                    onPressed: onExit,
                    icon: const Icon(Icons.logout),
                    label: const Text(
                      'Bajarme',
                      style: TextStyle(fontSize: 18),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.terracotta,
                      side: const BorderSide(
                        color: AppColors.terracotta,
                        width: 2,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Al bajar, dejamos de compartir tu ubicación',
                  style: TextStyle(color: AppColors.muted, fontSize: 15),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectableFilterChip extends StatelessWidget {
  const _SelectableFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.compact,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 15 : 18,
            vertical: compact ? 11 : 13,
          ),
          decoration: BoxDecoration(
            color: selected ? AppColors.ink : Colors.white,
            border: Border.all(
              color: selected ? AppColors.ink : AppColors.line,
              width: 1.5,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : AppColors.ink,
              fontSize: compact ? 14 : 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

ButtonStyle _secondaryButtonStyle() => OutlinedButton.styleFrom(
  foregroundColor: AppColors.ink,
  minimumSize: const Size(0, 58),
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
  side: const BorderSide(color: AppColors.line, width: 1.5),
  textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
);
