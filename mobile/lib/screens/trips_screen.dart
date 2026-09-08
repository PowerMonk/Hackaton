import 'package:flutter/material.dart';

import '../data/demo_data.dart';
import '../theme/app_theme.dart';
import '../widgets/map_canvas.dart';
import '../widgets/ui_components.dart';

class TripsScreen extends StatelessWidget {
  const TripsScreen({
    required this.onOpenActiveTrip,
    required this.onOpenService,
    super.key,
  });

  final VoidCallback onOpenActiveTrip;
  final VoidCallback onOpenService;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          Stack(
            children: [
              DemoMap(
                route: demoRoutes.first,
                showDemoLabel: true,
                height: 280,
              ),
              Positioned(
                bottom: 18,
                left: 22,
                right: 22,
                child: SoftCard(
                  color: AppColors.cream,
                  child: Row(
                    children: [
                      const Icon(Icons.science_outlined, size: 24),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Simulación de 3 unidades en R12 para probar el flujo sin salir a la calle.',
                          style: TextStyle(fontSize: 15, height: 1.3),
                        ),
                      ),
                      TextButton(
                        onPressed: onOpenService,
                        child: const Text('Salir'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 26, 22, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Mis viajes',
                      style: TextStyle(
                        fontSize: 31,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const StatusPill(label: '1 activo', color: AppColors.green),
                  ],
                ),
                const SizedBox(height: 18),
                InkWell(
                  onTap: onOpenActiveTrip,
                  borderRadius: BorderRadius.circular(24),
                  child: SoftCard(
                    color: AppColors.green,
                    borderColor: AppColors.green,
                    child: Row(
                      children: [
                        RouteBadge(route: demoRoutes.first, large: true),
                        const SizedBox(width: 15),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'R12 · Hacia Centro · en curso',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              SizedBox(height: 5),
                              Text(
                                'Próxima: Catedral · 3-5 min',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 15,
                                ),
                              ),
                            ],
                          ),
                        ),
                        OutlinedButton(
                          onPressed: onOpenActiveTrip,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.green,
                            backgroundColor: AppColors.cream,
                            side: BorderSide.none,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: const Text('Volver'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                const _TripHistoryCard(
                  routeIndex: 0,
                  title: 'Villalongín → Catedral',
                  detail: 'Hoy · 8:12',
                  contribution: 'Aportaste 14 min de datos · Gracias',
                ),
                const SizedBox(height: 14),
                const _TripHistoryCard(
                  routeIndex: 1,
                  title: 'Catedral → Villas',
                  detail: 'Ayer · 18:40',
                  contribution: 'Viaje observado · sin aporte',
                ),
                const SizedBox(height: 14),
                const _TripHistoryCard(
                  routeIndex: 2,
                  title: 'Lomas → Independencia',
                  detail: 'Lun · 9:05',
                  contribution: 'Aportaste 9 min de datos · Gracias',
                ),
                const SizedBox(height: 18),
                SoftCard(
                  color: AppColors.creamDark,
                  borderColor: AppColors.creamDark,
                  child: const Row(
                    children: [
                      Icon(Icons.eco_outlined, size: 32),
                      SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          'Impacto colectivo: esta semana ayudaste a 212 personas con ETAs más precisos.',
                          style: TextStyle(fontSize: 17, height: 1.4),
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
  }
}

class _TripHistoryCard extends StatelessWidget {
  const _TripHistoryCard({
    required this.routeIndex,
    required this.title,
    required this.detail,
    required this.contribution,
  });

  final int routeIndex;
  final String title;
  final String detail;
  final String contribution;

  @override
  Widget build(BuildContext context) => SoftCard(
    child: Row(
      children: [
        RouteBadge(route: demoRoutes[routeIndex]),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                detail,
                style: const TextStyle(color: AppColors.muted, fontSize: 15),
              ),
              const SizedBox(height: 7),
              Text(
                contribution,
                style: const TextStyle(color: AppColors.green, fontSize: 15),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right, size: 28),
      ],
    ),
  );
}
