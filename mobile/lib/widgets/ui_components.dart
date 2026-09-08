import 'package:flutter/material.dart';

import '../models/app_models.dart';
import '../theme/app_theme.dart';

class RouteBadge extends StatelessWidget {
  const RouteBadge({
    required this.route,
    this.large = false,
    this.compact = false,
    super.key,
  });

  final TransitRoute route;
  final bool large;
  final bool compact;

  /// Returns the display text: prefer displayCode, then short name, then id.
  String get _displayText {
    // Use displayCode if available (e.g., "R2", "Azul A")
    if (route.displayCode != null && route.displayCode!.isNotEmpty) {
      return route.displayCode!;
    }
    // Fallback to name if it's short enough
    if (route.name.length <= 12) {
      return route.name;
    }
    // Otherwise use id
    return route.id;
  }

  @override
  Widget build(BuildContext context) {
    final text = _displayText;
    // Adjust font size based on text length
    final baseFontSize = large ? 40.0 : (compact ? 19.0 : 26.0);
    final fontSize = text.length > 8
        ? baseFontSize * 0.7
        : text.length > 5
            ? baseFontSize * 0.85
            : baseFontSize;

    return Container(
      width: large ? 118 : (compact ? 70 : 114),
      height: large ? 82 : (compact ? 48 : 64),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: large ? AppColors.cream : route.color,
        borderRadius: BorderRadius.circular(compact ? 16 : 22),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          text,
          textAlign: TextAlign.center,
          maxLines: 1,
          style: TextStyle(
            color: large ? AppColors.green : Colors.white,
            fontSize: fontSize,
            fontWeight: FontWeight.w800,
            letterSpacing: -1,
          ),
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    required this.label,
    required this.color,
    this.background,
    super.key,
  });

  final String label;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    // El Flexible interno solo acota el texto si la píldora recibe un
    // maxWidth acotado: en los usos dentro de un Row hay que envolverla
    // con Flexible/Expanded (los hijos no-flex de un Row se miden sin
    // acotar en el eje principal).
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 9),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SoftCard extends StatelessWidget {
  const SoftCard({
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.color,
    this.borderColor,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: borderColor ?? AppColors.line, width: 1.5),
        boxShadow: borderColor == null
            ? const [
                BoxShadow(
                  color: Color(0x0D1B2738),
                  blurRadius: 14,
                  offset: Offset(0, 5),
                ),
              ]
            : null,
      ),
      child: child,
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    required this.label,
    required this.onPressed,
    this.icon,
    super.key,
  });

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 64,
      child: FilledButton.icon(
        onPressed: onPressed,
        icon: icon == null ? const SizedBox.shrink() : Icon(icon, size: 25),
        label: Text(
          label,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        ),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.terracotta,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(19),
          ),
        ),
      ),
    );
  }
}

class AppBottomBar extends StatelessWidget {
  const AppBottomBar({
    required this.currentIndex,
    required this.onSelected,
    super.key,
  });

  final int currentIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.home_rounded, 'Home'),
      (Icons.alt_route, 'Planear'),
      (Icons.history, 'Mis viajes'),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 360;
        final selectedWidth = ((constraints.maxWidth / 3) - 20).clamp(
          66.0,
          118.0,
        );
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFFFFFCF6),
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          padding: EdgeInsets.fromLTRB(
            compact ? 8 : 16,
            8,
            compact ? 8 : 16,
            10,
          ),
          child: Row(
            children: List.generate(items.length, (index) {
              final selected = currentIndex == index;
              return Expanded(
                child: InkWell(
                  onTap: () => onSelected(index),
                  borderRadius: BorderRadius.circular(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: selected ? selectedWidth : 58,
                        height: compact ? 48 : 54,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.ink : Colors.transparent,
                          borderRadius: BorderRadius.circular(30),
                        ),
                        child: Icon(
                          items[index].$1,
                          color: selected ? Colors.white : AppColors.muted,
                          size: compact ? 26 : 30,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        items[index].$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: selected ? AppColors.ink : AppColors.muted,
                          fontSize: compact ? 13 : 15,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: selected
                              ? AppColors.terracotta
                              : Colors.transparent,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        );
      },
    );
  }
}
