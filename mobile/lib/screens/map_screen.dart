import 'package:flutter/material.dart';

import '../data/demo_data.dart';
import '../data/demo_simulation.dart';
import '../data/routes_repository.dart';
import '../models/app_models.dart';
import '../theme/app_theme.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui_components.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({required this.onOpenService, super.key});

  final VoidCallback onOpenService;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  TransitRoute? selectedRoute;
  String selectedFilter = 'Cerca de mí';
  String query = '';
  List<TransitRoute> routes = demoRoutes;
  bool loadingReal = true;
  bool activeTrip = false;
  bool tripMinimized = false;
  bool routeFocused = false;

  @override
  void initState() {
    super.initState();
    _loadRealRoutes();
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
    });
  }

  List<TransitRoute> get visibleRoutes {
    var list = switch (selectedFilter) {
      'Combis' => routes.where((route) => route.mode == 'Combi').toList(),
      'Camiones' => routes
          .where(
            (route) => route.mode == 'Camión' || route.mode == 'Micro',
          )
          .toList(),
      _ => List<TransitRoute>.from(routes),
    };
    list = RoutesRepository.search(list, query);
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
          onBack: () => setState(() => tripMinimized = true),
          onExit: () => setState(() {
            activeTrip = false;
            tripMinimized = false;
            routeFocused = selectedRoute != null;
          }),
        ),
      );
    }
    if (selectedRoute != null && routeFocused) {
      return FocusedRouteView(
        route: selectedRoute!,
        onBack: () => setState(() {
          selectedRoute = null;
          routeFocused = false;
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
    return RouteSelectionView(
      selectedRoute: selectedRoute,
      selectedFilter: selectedFilter,
      routes: visibleRoutes,
      totalCount: routes.length,
      isLoadingReal: loadingReal,
      query: query,
      onQueryChanged: (q) => setState(() => query = q),
      onSelect: _selectRoute,
      onSelectFilter: (filter) => setState(() => selectedFilter = filter),
      onViewMap: () {
        if (selectedRoute != null) setState(() => routeFocused = true);
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
    if (boarded == true && mounted) {
      setState(() {
        activeTrip = true;
        tripMinimized = false;
      });
    }
  }
}

class RouteSelectionView extends StatelessWidget {
  const RouteSelectionView({
    required this.selectedRoute,
    required this.selectedFilter,
    required this.routes,
    required this.totalCount,
    required this.isLoadingReal,
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
        final visibleRoutes = routes;
        final subtitle = isLoadingReal
            ? 'Sin destino obligatorio · cargando datos OSM…'
            : 'Sin destino obligatorio · $totalCount rutas · datos OSM';
        return Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(horizontal, 18, horizontal, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Elige tu ruta',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: isCompact ? 27 : 32,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -1,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: isCompact ? 15 : 17,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    TextField(
                      onChanged: onQueryChanged,
                      decoration: InputDecoration(
                        hintText: 'Buscar por número, colonia o destino...',
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
                              padding: const EdgeInsets.only(right: 10),
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
                                    : (visibleRoutes.isNotEmpty
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
                    const SizedBox(height: 16),
                    ...visibleRoutes.map(
                      (route) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: SelectableRouteCard(
                          route: route,
                          selected: selectedRoute?.id == route.id,
                          compact: isCompact,
                          onTap: () => onSelect(route),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Container(
              padding: EdgeInsets.fromLTRB(horizontal, 12, horizontal, 14),
              decoration: const BoxDecoration(
                color: AppColors.cream,
                border: Border(top: BorderSide(color: AppColors.line)),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    PrimaryButton(
                      label: 'Ver en el mapa',
                      onPressed: onViewMap,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Puedes cambiar de ruta cuando quieras',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.muted,
                        fontSize: isCompact ? 13 : 14,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
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

class FocusedRouteView extends StatelessWidget {
  const FocusedRouteView({
    required this.route,
    required this.onBack,
    required this.onBoarding,
    required this.onService,
    super.key,
  });

  final TransitRoute route;
  final VoidCallback onBack;
  final VoidCallback onBoarding;
  final VoidCallback onService;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final compact = MediaQuery.sizeOf(context).width < 360;
    final mapHeight = (screenHeight * 0.56).clamp(360.0, 560.0);
    final isReal = route.tieneGeometriaReal;
    final simEta = isReal
        ? DemoSimulation().etaFor(route.polyline!, 0.4).label
        : '4-6 min';
    final vehicleTitle =
        isReal ? 'Unidad simulada en recorrido' : 'Unidad a 350 m de ti';
    final vehicleSubtitle = isReal
        ? 'Sobre el trazo OSM · confianza media'
        : 'Cerca de Villalongín · confianza alta';
    return SingleChildScrollView(
      child: Column(
        children: [
          SizedBox(
            height: mapHeight,
            child: Stack(
              children: [
                Positioned.fill(
                  child: DemoMap(route: route, height: mapHeight),
                ),
                Positioned(
                  top: 26,
                  left: 22,
                  right: 22,
                  child: SoftCard(
                    color: AppColors.cream,
                    borderColor: AppColors.terracotta,
                    padding: const EdgeInsets.all(17),
                    child: Row(
                      children: [
                        RouteBadge(route: route, compact: true),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isReal
                                    ? '${route.id} · ${route.name}'
                                    : '${route.id} · Hacia Centro',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: compact ? 16 : 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              StatusPill(
                                label: isReal
                                    ? 'Confianza media · estimado'
                                    : 'Alta confianza',
                                color: isReal
                                    ? AppColors.amber
                                    : AppColors.green,
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: onBack,
                          icon: const Icon(Icons.close, size: 30),
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: InkWell(
                    onTap: onBoarding,
                    borderRadius: BorderRadius.circular(24),
                    child: SoftCard(
                      color: AppColors.ink,
                      borderColor: AppColors.ink,
                      child: Row(
                        children: [
                          Container(
                            width: compact ? 46 : 55,
                            height: compact ? 46 : 55,
                            decoration: BoxDecoration(
                              color: AppColors.greenBright,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Icon(
                              Icons.directions_bus,
                              color: Colors.white,
                              size: compact ? 24 : 29,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  vehicleTitle,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: compact ? 15 : 17,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  vehicleSubtitle,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white70,
                                    fontSize: compact ? 12 : 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: compact ? 10 : 14,
                              vertical: compact ? 9 : 12,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.cream,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              simEta,
                              style: TextStyle(
                                fontSize: compact ? 15 : 17,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 30),
            decoration: const BoxDecoration(
              color: AppColors.cream,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Paradas en secuencia',
                  style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
                ),
                if (isReal)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Trazo OSM · ${route.polyline!.length} pts · estimado',
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 14,
                      ),
                    ),
                  ),
                const SizedBox(height: 18),
                FutureBuilder<List<StopInfo>>(
                  future: RoutesRepository.stopsFor(route),
                  initialData: demoStops,
                  builder: (context, snapshot) {
                    final stops = snapshot.data ?? demoStops;
                    return Column(
                      children: [
                        for (final stop in stops)
                          StopTimelineItem(stop: stop),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: onService,
                  icon: const Icon(Icons.wifi_off),
                  label: const Text('Ver estado del servicio'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.ink,
                    minimumSize: const Size(double.infinity, 54),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(17),
                    ),
                    side: const BorderSide(color: AppColors.line),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: OutlinedButton.icon(
                    onPressed: onBack,
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('Volver al mapa'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.ink,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(17),
                      ),
                      side: const BorderSide(color: AppColors.line),
                    ),
                  ),
                ),
              ],
            ),
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
                  width: 25,
                  height: 25,
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
                Container(width: 2, height: 42, color: AppColors.line),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stop.name,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    stop.detail,
                    style: TextStyle(
                      fontSize: 16,
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
    required this.onExit,
    required this.onBack,
    super.key,
  });

  final TransitRoute route;
  final VoidCallback onExit;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
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
                    const Icon(Icons.wifi, color: Colors.white),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    RouteBadge(route: route, large: true),
                    const SizedBox(width: 18),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Hacia Centro',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(height: 7),
                          Text(
                            'Próxima: Catedral · 3-5 min',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 18,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
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
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Villalongín',
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                    Text(
                      '3 de 7 paradas',
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                    Text(
                      'Terminal',
                      style: TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                  ],
                ),
              ],
            ),
          ),
          DemoMap(route: route, height: 390),
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
                  child: const Row(
                    children: [
                      Icon(Icons.sensors_outlined, size: 30),
                      SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Compartiendo ubicación aproximada',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 5),
                            Text(
                              'Última actualización hace 28 s · ahorro de batería',
                              style: TextStyle(
                                fontSize: 15,
                                color: Color(0xFF40506A),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.info_outline),
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
