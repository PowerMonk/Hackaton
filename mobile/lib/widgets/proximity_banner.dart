import 'package:flutter/material.dart';

import '../models/proximity_models.dart';
import '../theme/app_theme.dart';

/// Banner displayed when proximity events occur.
class ProximityBanner extends StatelessWidget {
  const ProximityBanner({
    required this.state,
    this.onDismiss,
    this.onConfirmBoarding,
    this.onConfirmArrival,
    super.key,
  });

  final BoardingState state;
  final VoidCallback? onDismiss;
  final VoidCallback? onConfirmBoarding;
  final VoidCallback? onConfirmArrival;

  @override
  Widget build(BuildContext context) {
    final event = state.primaryEvent;
    if (event == null) return const SizedBox.shrink();

    return _buildBannerForEvent(event);
  }

  Widget _buildBannerForEvent(ProximityEvent event) {
    switch (event.type) {
      case 'at_stop':
        return _AtStopBanner(
          stopName: event.stopName ?? 'la parada',
          onDismiss: onDismiss,
        );
      case 'near_stop':
        return _NearStopBanner(
          stopName: event.stopName ?? 'una parada',
          distanceMeters: state.closestStop?.distanceMeters.round() ?? 0,
          onDismiss: onDismiss,
        );
      case 'boarding_likely':
        return _BoardingPromptBanner(
          message: event.message,
          onConfirm: onConfirmBoarding,
          onDismiss: onDismiss,
        );
      case 'on_vehicle':
        return _OnVehicleBanner(
          progress: state.progressPercent,
          confidence: event.confidence,
          onDismiss: onDismiss,
        );
      case 'alighting_likely':
        return _ArrivalPromptBanner(
          stopName: event.stopName,
          message: event.message,
          onConfirm: onConfirmArrival,
          onDismiss: onDismiss,
        );
      default:
        return const SizedBox.shrink();
    }
  }
}

class _AtStopBanner extends StatelessWidget {
  const _AtStopBanner({
    required this.stopName,
    this.onDismiss,
  });

  final String stopName;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return _BannerContainer(
      color: AppColors.teal,
      icon: Icons.location_on,
      title: 'En la parada',
      subtitle: stopName,
      onDismiss: onDismiss,
    );
  }
}

class _NearStopBanner extends StatelessWidget {
  const _NearStopBanner({
    required this.stopName,
    required this.distanceMeters,
    this.onDismiss,
  });

  final String stopName;
  final int distanceMeters;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return _BannerContainer(
      color: AppColors.amber,
      icon: Icons.near_me,
      title: 'Cerca de $stopName',
      subtitle: '${distanceMeters}m de distancia',
      onDismiss: onDismiss,
    );
  }
}

class _BoardingPromptBanner extends StatelessWidget {
  const _BoardingPromptBanner({
    required this.message,
    this.onConfirm,
    this.onDismiss,
  });

  final String message;
  final VoidCallback? onConfirm;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return _BannerContainer(
      color: AppColors.terracotta,
      icon: Icons.directions_bus,
      title: '¿Ya subiste?',
      subtitle: message,
      onDismiss: onDismiss,
      action: onConfirm != null
          ? TextButton(
              onPressed: onConfirm,
              style: TextButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.terracotta,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              ),
              child: const Text(
                'Sí, ya subí',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            )
          : null,
    );
  }
}

class _OnVehicleBanner extends StatelessWidget {
  const _OnVehicleBanner({
    required this.progress,
    required this.confidence,
    this.onDismiss,
  });

  final int progress;
  final String confidence;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return _BannerContainer(
      color: AppColors.greenBright,
      icon: Icons.directions_bus,
      title: 'En camino',
      subtitle: 'Progreso: $progress%',
      onDismiss: onDismiss,
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          confidence,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _ArrivalPromptBanner extends StatelessWidget {
  const _ArrivalPromptBanner({
    this.stopName,
    required this.message,
    this.onConfirm,
    this.onDismiss,
  });

  final String? stopName;
  final String message;
  final VoidCallback? onConfirm;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return _BannerContainer(
      color: AppColors.teal,
      icon: Icons.flag,
      title: stopName != null ? '¿Llegaste a $stopName?' : '¿Ya llegaste?',
      subtitle: message,
      onDismiss: onDismiss,
      action: onConfirm != null
          ? TextButton(
              onPressed: onConfirm,
              style: TextButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.teal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              ),
              child: const Text(
                'Sí, llegué',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            )
          : null,
    );
  }
}

class _BannerContainer extends StatelessWidget {
  const _BannerContainer({
    required this.color,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onDismiss,
    this.action,
    this.trailing,
  });

  final Color color;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onDismiss;
  final Widget? action;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.4),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
          if (action != null) ...[
            const SizedBox(width: 10),
            action!,
          ],
          if (onDismiss != null && action == null)
            IconButton(
              onPressed: onDismiss,
              icon: const Icon(Icons.close, color: Colors.white70),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
        ],
      ),
    );
  }
}

/// Compact proximity indicator for minimized trip view.
class ProximityIndicator extends StatelessWidget {
  const ProximityIndicator({
    required this.state,
    super.key,
  });

  final BoardingState state;

  @override
  Widget build(BuildContext context) {
    if (state.isOnVehicle) {
      return _CompactIndicator(
        icon: Icons.directions_bus,
        label: 'En camino · ${state.progressPercent}%',
        color: AppColors.greenBright,
      );
    }
    if (state.isNearStop && state.closestStop != null) {
      return _CompactIndicator(
        icon: Icons.location_on,
        label: '${state.closestStop!.distanceMeters.round()}m de parada',
        color: AppColors.amber,
      );
    }
    return const SizedBox.shrink();
  }
}

class _CompactIndicator extends StatelessWidget {
  const _CompactIndicator({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
