import 'package:flutter/material.dart';

import '../data/demo_data.dart';
import '../data/routes_repository.dart';
import '../models/app_models.dart';
import '../theme/app_theme.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui_components.dart';

class TripsScreen extends StatefulWidget {
  const TripsScreen({required this.onOpenActiveTrip, super.key});

  final VoidCallback onOpenActiveTrip;

  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  List<TransitRoute> routes = demoRoutes;

  @override
  void initState() {
    super.initState();
    _loadRoutes();
  }

  Future<void> _loadRoutes() async {
    final loaded = await RoutesRepository.loadDemoRoutes();
    if (mounted) setState(() => routes = loaded);
  }

  TransitRoute get currentRoute => routes.firstWhere(
    (route) => route.tieneGeometriaReal,
    orElse: () => routes.first,
  );

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;
        final route = currentRoute;
        return SingleChildScrollView(
          child: Column(
            children: [
              DemoMap(route: route, height: compact ? 220 : 280),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  compact ? 16 : 22,
                  compact ? 20 : 26,
                  compact ? 16 : 22,
                  26,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Mis viajes',
                          style: TextStyle(
                            fontSize: compact ? 27 : 31,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const StatusPill(
                          label: '1 activo',
                          color: AppColors.green,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _ActiveTripCard(
                      route: route,
                      compact: compact,
                      onOpen: widget.onOpenActiveTrip,
                    ),
                    const SizedBox(height: 10),
                    _TripHistoryCard(
                      route: routes.isNotEmpty
                          ? routes.first
                          : demoRoutes.first,
                      title: 'Villalongín → Catedral',
                      detail: 'Hoy · 8:12',
                      contribution: 'Aportaste 14 min · Gracias',
                      compact: compact,
                    ),
                    const SizedBox(height: 10),
                    _TripHistoryCard(
                      route: routes.length > 1 ? routes[1] : demoRoutes[1],
                      title: 'Catedral → Villas',
                      detail: 'Ayer · 18:40',
                      contribution: 'Viaje observado · sin aporte',
                      compact: compact,
                    ),
                    const SizedBox(height: 10),
                    _TripHistoryCard(
                      route: routes.length > 2 ? routes[2] : demoRoutes[2],
                      title: 'Lomas → Independencia',
                      detail: 'Lun · 9:05',
                      contribution: 'Aportaste 9 min · Gracias',
                      compact: compact,
                    ),
                    const SizedBox(height: 14),
                    SoftCard(
                      color: AppColors.creamDark,
                      borderColor: AppColors.creamDark,
                      padding: EdgeInsets.all(compact ? 14 : 18),
                      child: const Row(
                        children: [
                          Icon(Icons.eco_outlined, size: 27),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Esta semana ayudaste a 212 personas con ETAs más precisos.',
                              style: TextStyle(fontSize: 14, height: 1.35),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ActiveTripCard extends StatelessWidget {
  const _ActiveTripCard({
    required this.route,
    required this.compact,
    required this.onOpen,
  });

  final TransitRoute route;
  final bool compact;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final details = Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${route.id} · viaje en curso',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 15 : 17,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Próxima: Catedral · 3-5 min',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
        ],
      ),
    );

    return InkWell(
      onTap: onOpen,
      borderRadius: BorderRadius.circular(20),
      child: SoftCard(
        color: AppColors.green,
        borderColor: AppColors.green,
        padding: EdgeInsets.all(compact ? 13 : 16),
        child: compact
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      RouteBadge(route: route, compact: true),
                      const SizedBox(width: 12),
                      details,
                    ],
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton(
                      onPressed: onOpen,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.green,
                        backgroundColor: AppColors.cream,
                        side: BorderSide.none,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 9,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(13),
                        ),
                      ),
                      child: const Text('Volver'),
                    ),
                  ),
                ],
              )
            : Row(
                children: [
                  RouteBadge(route: route, compact: true),
                  const SizedBox(width: 14),
                  details,
                  const SizedBox(width: 10),
                  OutlinedButton(
                    onPressed: onOpen,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.green,
                      backgroundColor: AppColors.cream,
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(13),
                      ),
                    ),
                    child: const Text('Volver'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _TripHistoryCard extends StatelessWidget {
  const _TripHistoryCard({
    required this.route,
    required this.title,
    required this.detail,
    required this.contribution,
    required this.compact,
  });

  final TransitRoute route;
  final String title;
  final String detail;
  final String contribution;
  final bool compact;

  @override
  Widget build(BuildContext context) => SoftCard(
    padding: EdgeInsets.all(compact ? 12 : 16),
    child: Row(
      children: [
        RouteBadge(route: route, compact: true),
        SizedBox(width: compact ? 11 : 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: compact ? 15 : 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                detail,
                style: TextStyle(
                  color: AppColors.muted,
                  fontSize: compact ? 12 : 14,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                contribution,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppColors.green,
                  fontSize: compact ? 12 : 14,
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right, size: 24),
      ],
    ),
  );
}
