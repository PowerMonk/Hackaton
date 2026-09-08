import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/ui_components.dart';

class ServiceStatusScreen extends StatelessWidget {
  const ServiceStatusScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Estado del servicio',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 18),
            child: StatusPill(
              label: 'Modo demostración',
              color: Colors.white,
              background: AppColors.ink,
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 30),
        child: Column(
          children: [
            SoftCard(
              color: AppColors.ink,
              borderColor: AppColors.ink,
              child: Row(
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: const Color(0xFF384250),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.wifi_off,
                      color: Colors.white,
                      size: 34,
                    ),
                  ),
                  const SizedBox(width: 18),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Sin conexión',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 7),
                        Text(
                          'Mostramos horarios base guardados. Los tiempos en vivo volverán solos.',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 17,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {},
                    style: TextButton.styleFrom(
                      backgroundColor: AppColors.cream,
                      foregroundColor: AppColors.ink,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 17,
                        vertical: 15,
                      ),
                    ),
                    child: const Text(
                      'Reintentar',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _StatusTile(
                    icon: Icons.visibility_off_outlined,
                    title: 'Sin rutas cercanas',
                    text: 'Camina a Av. Madero · 300 m con servicio.',
                    action: 'Ver mapa amplio',
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: _StatusTile(
                    icon: Icons.my_location,
                    title: 'Activa tu ubicación',
                    text: 'La usamos solo para ETAs y tu viaje.',
                    action: 'Permitir',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SoftCard(
              borderColor: AppColors.amber,
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.hourglass_top, size: 30),
                  SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ETA desactualizado · R12',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 7),
                        Text(
                          'Sin datos desde hace 3 min. Rango 8-14 min. No salgas corriendo.',
                          style: TextStyle(
                            color: AppColors.muted,
                            fontSize: 16,
                            height: 1.35,
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          'Reintentando cada 30 s...',
                          style: TextStyle(
                            color: AppColors.amber,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.sync, size: 28),
                      SizedBox(width: 12),
                      Text(
                        'Cargando datos de la ruta...',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: const LinearProgressIndicator(
                      value: 0.46,
                      minHeight: 12,
                      color: AppColors.terracotta,
                      backgroundColor: AppColors.creamDark,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SoftCard(
              color: const Color(0xFFE1F4E8),
              borderColor: const Color(0xFF9ED5B6),
              child: const Row(
                children: [
                  Icon(Icons.directions_bus, color: AppColors.green, size: 35),
                  SizedBox(width: 15),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Viaje activo · conexión intermitente',
                          style: TextStyle(
                            fontSize: 18,
                            color: AppColors.green,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 6),
                        Text(
                          'Guardamos tus puntos y los enviamos al reconectar. Sigue a bordo.',
                          style: TextStyle(fontSize: 16, height: 1.35),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    'hace 1 min',
                    style: TextStyle(
                      color: AppColors.green,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({
    required this.icon,
    required this.title,
    required this.text,
    required this.action,
  });

  final IconData icon;
  final String title;
  final String text;
  final String action;

  @override
  Widget build(BuildContext context) => SoftCard(
    child: Column(
      children: [
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            color: AppColors.creamDark,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(icon, size: 30),
        ),
        const SizedBox(height: 17),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 9),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.muted,
            fontSize: 15,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          action,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.terracotta,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}
