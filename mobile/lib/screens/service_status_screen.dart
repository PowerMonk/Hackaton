import 'dart:async';
import 'package:flutter/material.dart';

import '../data/health_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/ui_components.dart';

/// Pantalla de estado del servicio.
///
/// Se muestra automáticamente cuando hay degradación del servicio.
/// Consulta /health automáticamente y muestra estado real.
class ServiceStatusScreen extends StatefulWidget {
  const ServiceStatusScreen({super.key});

  @override
  State<ServiceStatusScreen> createState() => _ServiceStatusScreenState();
}

class _ServiceStatusScreenState extends State<ServiceStatusScreen> {
  late final StreamSubscription<HealthStatus> _subscription;
  HealthStatus? _status;
  bool _isRetrying = false;

  @override
  void initState() {
    super.initState();
    _status = healthRepository.lastStatus;
    _subscription = healthRepository.statusStream.listen((status) {
      if (mounted) {
        setState(() {
          _status = status;
          _isRetrying = false;
        });
      }
    });
    // Check immediately if no status
    if (_status == null) {
      healthRepository.checkHealth();
    }
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }

  Future<void> _retry() async {
    setState(() => _isRetrying = true);
    await healthRepository.checkHealth();
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;

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
              label: _getModeLabel(status),
              color: _getModeTextColor(status),
              background: _getModeBgColor(status),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 30),
        child: Column(
          children: [
            // Connection status card
            _buildConnectionCard(status),
            const SizedBox(height: 16),

            // Stats row
            if (status != null && status.isConnected)
              _buildStatsRow(status),

            // Show degradation warnings
            if (status != null && status.isDegraded && status.isConnected)
              _buildDegradedWarning(status),
          ],
        ),
      ),
    );
  }

  Widget _buildConnectionCard(HealthStatus? status) {
    final isConnected = status?.isConnected ?? false;
    final isHealthy = status?.isHealthy ?? false;

    return SoftCard(
      color: isConnected && isHealthy ? const Color(0xFFE1F4E8) : AppColors.ink,
      borderColor: isConnected && isHealthy ? const Color(0xFF9ED5B6) : AppColors.ink,
      child: Row(
        children: [
          Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(
              color: isConnected && isHealthy
                  ? AppColors.green.withValues(alpha: 0.2)
                  : const Color(0xFF384250),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(
              isConnected && isHealthy ? Icons.wifi : Icons.wifi_off,
              color: isConnected && isHealthy ? AppColors.green : Colors.white,
              size: 34,
            ),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isConnected
                      ? (isHealthy ? 'Conectado' : 'Servicio degradado')
                      : 'Sin conexión',
                  style: TextStyle(
                    color: isConnected && isHealthy ? AppColors.green : Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  isConnected
                      ? (isHealthy
                          ? 'Datos en tiempo real disponibles.'
                          : status?.errorMessage ?? 'El servicio tiene problemas.')
                      : status?.errorMessage ?? 'Mostramos datos demo guardados.',
                  style: TextStyle(
                    color: isConnected && isHealthy
                        ? AppColors.muted
                        : Colors.white70,
                    fontSize: 17,
                    height: 1.4,
                  ),
                ),
                if (status != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Último chequeo: ${_formatTime(status.lastCheckedAt)}',
                    style: TextStyle(
                      color: isConnected && isHealthy
                          ? AppColors.muted
                          : Colors.white54,
                      fontSize: 14,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (!isConnected || !isHealthy)
            TextButton(
              onPressed: _isRetrying ? null : _retry,
              style: TextButton.styleFrom(
                backgroundColor: AppColors.cream,
                foregroundColor: AppColors.ink,
                padding: const EdgeInsets.symmetric(
                  horizontal: 17,
                  vertical: 15,
                ),
              ),
              child: _isRetrying
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text(
                      'Reintentar',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
        ],
      ),
    );
  }

  Widget _buildStatsRow(HealthStatus status) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: Icons.directions_bus,
              value: '${status.vehicleCount}',
              label: 'Vehículos',
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: _StatCard(
              icon: Icons.route,
              value: '${status.routeCount}',
              label: 'Rutas',
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: _StatCard(
              icon: Icons.speed,
              value: status.mode.toUpperCase(),
              label: 'Modo',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDegradedWarning(HealthStatus status) {
    return SoftCard(
      borderColor: AppColors.amber,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber, color: AppColors.amber, size: 30),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Servicio en modo degradado',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  status.errorMessage ?? 'Algunos datos pueden estar desactualizados.',
                  style: const TextStyle(
                    color: AppColors.muted,
                    fontSize: 16,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Reintentando automáticamente...',
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
    );
  }

  String _getModeLabel(HealthStatus? status) {
    if (status == null) return 'Verificando...';
    if (!status.isConnected) return 'Offline';
    if (status.isDemoMode) return 'Modo demo';
    if (status.isLiveMode) return 'En vivo';
    return 'Degradado';
  }

  Color _getModeTextColor(HealthStatus? status) {
    if (status == null) return AppColors.muted;
    if (!status.isConnected) return Colors.white;
    if (status.isDemoMode) return Colors.white;
    if (status.isLiveMode) return AppColors.green;
    return AppColors.amber;
  }

  Color _getModeBgColor(HealthStatus? status) {
    if (status == null) return AppColors.creamDark;
    if (!status.isConnected) return AppColors.ink;
    if (status.isDemoMode) return AppColors.ink;
    if (status.isLiveMode) return const Color(0xFFE1F4E8);
    return AppColors.amber.withValues(alpha: 0.2);
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes}min';
    return 'hace ${diff.inHours}h';
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      child: Column(
        children: [
          Icon(icon, size: 28, color: AppColors.ink),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.muted,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
