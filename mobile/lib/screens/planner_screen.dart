import 'package:flutter/material.dart';

import '../data/demo_data.dart';
import '../theme/app_theme.dart';
import '../widgets/ui_components.dart';

class PlannerScreen extends StatefulWidget {
  const PlannerScreen({super.key});

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> {
  final originController = TextEditingController(
    text: 'Mi ubicación · Catedral',
  );
  final destinationController = TextEditingController(
    text: 'Hospital Ángeles · Altozano',
  );

  var preference = 'Más rápido';
  var selectedMode = 'Transporte';
  String? activeField;
  AddressSuggestion? selectedOrigin;
  AddressSuggestion? selectedDestination;

  static const addressSuggestions = <AddressSuggestion>[
    AddressSuggestion(
      label: 'Catedral de Morelia',
      detail: 'Centro Histórico',
      lat: 19.7029,
      lon: -101.1921,
    ),
    AddressSuggestion(
      label: 'Hospital Ángeles Altozano',
      detail: 'Altozano',
      lat: 19.6734,
      lon: -101.1432,
    ),
    AddressSuggestion(
      label: 'Acueducto de Morelia',
      detail: 'Calzada Fray Antonio de San Miguel',
      lat: 19.6968,
      lon: -101.1744,
    ),
    AddressSuggestion(
      label: 'Villas del Pedregal',
      detail: 'Poniente de Morelia',
      lat: 19.6748,
      lon: -101.3264,
    ),
  ];

  @override
  void dispose() {
    originController.dispose();
    destinationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;
        final horizontal = compact ? 16.0 : 22.0;
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            horizontal,
            compact ? 18 : 26,
            horizontal,
            30,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'PLANEAR',
                style: TextStyle(
                  color: AppColors.terracotta,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                '¿A dónde vamos?',
                style: TextStyle(
                  fontSize: compact ? 27 : 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.5,
                ),
              ),
              const SizedBox(height: 20),
              SoftCard(
                padding: EdgeInsets.all(compact ? 15 : 20),
                child: Column(
                  children: [
                    _PlaceField(
                      controller: originController,
                      color: AppColors.teal,
                      title: 'Origen',
                      icon: Icons.gps_fixed,
                      onTap: () => setState(() => activeField = 'origin'),
                      onChanged: (value) =>
                          setState(() => activeField = 'origin'),
                    ),
                    if (activeField == 'origin')
                      _SuggestionList(
                        query: originController.text,
                        suggestions: addressSuggestions,
                        onSelected: (suggestion) {
                          originController.text = suggestion.label;
                          selectedOrigin = suggestion;
                          setState(() => activeField = null);
                        },
                      ),
                    const Divider(height: 24),
                    _PlaceField(
                      controller: destinationController,
                      color: AppColors.terracotta,
                      title: 'Destino',
                      icon: Icons.swap_vert,
                      onTap: () => setState(() => activeField = 'destination'),
                      onChanged: (value) =>
                          setState(() => activeField = 'destination'),
                    ),
                    if (activeField == 'destination')
                      _SuggestionList(
                        query: destinationController.text,
                        suggestions: addressSuggestions,
                        onSelected: (suggestion) {
                          destinationController.text = suggestion.label;
                          selectedDestination = suggestion;
                          setState(() => activeField = null);
                        },
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _SectionLabel(label: 'Prioridad'),
              const SizedBox(height: 9),
              Wrap(
                spacing: 9,
                runSpacing: 9,
                children:
                    [
                      'Más rápido',
                      'Menos caminata',
                      'Menos transbordos',
                      'Más económico',
                    ].map((item) {
                      return _PreferenceChip(
                        label: item,
                        selected: preference == item,
                        onTap: () => setState(() => preference = item),
                        compact: compact,
                      );
                    }).toList(),
              ),
              const SizedBox(height: 16),
              _SectionLabel(label: 'Modo de viaje'),
              const SizedBox(height: 9),
              Wrap(
                spacing: 9,
                runSpacing: 9,
                children: [
                  _ModeChoice(
                    label: 'A pie',
                    icon: Icons.directions_walk,
                    selected: selectedMode == 'A pie',
                    onTap: () => setState(() => selectedMode = 'A pie'),
                  ),
                  _ModeChoice(
                    label: 'Transporte',
                    icon: Icons.directions_bus,
                    selected: selectedMode == 'Transporte',
                    color: AppColors.terracotta,
                    onTap: () => setState(() => selectedMode = 'Transporte'),
                  ),
                  _ModeChoice(
                    label: 'Bici',
                    icon: Icons.directions_bike,
                    selected: selectedMode == 'Bici',
                    onTap: () => setState(() => selectedMode = 'Bici'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _RecommendedPlan(compact: compact),
              const SizedBox(height: 12),
              _AlternativePlan(
                compact: compact,
                time: '41 min',
                description:
                    'Caminar 12 min · R11 + RT · 1 transbordo · \$18 est.',
                status: 'Media',
                statusColor: AppColors.amber,
              ),
              const SizedBox(height: 12),
              _AlternativePlan(
                compact: compact,
                time: '28 min',
                description:
                    'Bici 22 min + caminar 6 min · Solo ciclovía Acueducto',
                status: 'Tranquila',
                statusColor: AppColors.green,
              ),
              const SizedBox(height: 14),
              const Center(
                child: Text(
                  'Costos estimados, pueden variar. Sin pagos en la app.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, fontSize: 14),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: AppColors.muted,
        fontSize: 14,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.4,
      ),
    );
  }
}

class _PlaceField extends StatelessWidget {
  const _PlaceField({
    required this.controller,
    required this.color,
    required this.title,
    required this.icon,
    required this.onTap,
    required this.onChanged,
  });

  final TextEditingController controller;
  final Color color;
  final String title;
  final IconData icon;
  final VoidCallback onTap;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: TextField(
            controller: controller,
            onTap: onTap,
            onChanged: onChanged,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: title,
              labelStyle: const TextStyle(color: AppColors.muted, fontSize: 15),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
        Icon(icon, size: 27),
      ],
    );
  }
}

class AddressSuggestion {
  const AddressSuggestion({
    required this.label,
    required this.detail,
    required this.lat,
    required this.lon,
  });

  final String label;
  final String detail;
  final double lat;
  final double lon;
}

class _SuggestionList extends StatelessWidget {
  const _SuggestionList({
    required this.query,
    required this.suggestions,
    required this.onSelected,
  });

  final String query;
  final List<AddressSuggestion> suggestions;
  final ValueChanged<AddressSuggestion> onSelected;

  @override
  Widget build(BuildContext context) {
    final normalized = query.trim().toLowerCase();
    final visible = normalized.isEmpty
        ? suggestions
        : suggestions
              .where(
                (suggestion) =>
                    suggestion.label.toLowerCase().contains(normalized) ||
                    suggestion.detail.toLowerCase().contains(normalized),
              )
              .toList();
    if (visible.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        color: AppColors.creamDark,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          for (final suggestion in visible)
            ListTile(
              dense: true,
              leading: const Icon(Icons.location_on_outlined, size: 21),
              title: Text(
                suggestion.label,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              subtitle: Text(suggestion.detail),
              onTap: () => onSelected(suggestion),
            ),
        ],
      ),
    );
  }
}

class _PreferenceChip extends StatelessWidget {
  const _PreferenceChip({
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
        borderRadius: BorderRadius.circular(22),
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 14 : 18,
            vertical: compact ? 11 : 13,
          ),
          decoration: BoxDecoration(
            color: selected ? AppColors.ink : Colors.white,
            border: Border.all(
              color: selected ? AppColors.ink : AppColors.line,
              width: 1.5,
            ),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : AppColors.ink,
              fontSize: compact ? 13 : 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _ModeChoice extends StatelessWidget {
  const _ModeChoice({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.color = AppColors.ink,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final activeColor = selected ? color : AppColors.muted;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(17),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
          decoration: BoxDecoration(
            color: selected ? color.withValues(alpha: 0.1) : Colors.white,
            border: Border.all(
              color: selected ? color : AppColors.line,
              width: selected ? 2 : 1.5,
            ),
            borderRadius: BorderRadius.circular(17),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: activeColor, size: 23),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: activeColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecommendedPlan extends StatelessWidget {
  const _RecommendedPlan({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(compact ? 15 : 19),
      decoration: BoxDecoration(
        color: AppColors.ink,
        border: Border.all(color: AppColors.green, width: 4),
        borderRadius: BorderRadius.circular(26),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 10,
            spacing: 12,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: AppColors.greenBright,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'RECOMENDADA',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Text(
                '32 min',
                style: TextStyle(
                  color: AppColors.cream,
                  fontSize: compact ? 29 : 35,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 12,
            spacing: 12,
            children: [
              const Text(
                '6 min',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              RouteBadge(route: demoRoutes.first, compact: compact),
              const Text(
                '18 min · 6 paradas',
                style: TextStyle(color: Colors.white70, fontSize: 15),
              ),
              const Text(
                '8 min',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const Divider(color: Colors.white24, height: 28),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 10,
            spacing: 10,
            children: [
              const Text(
                'Costo estimado \$11 · Sin transbordos',
                style: TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const StatusPill(
                label: 'Alta',
                color: AppColors.green,
                background: Color(0xFFE1F4E8),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AlternativePlan extends StatelessWidget {
  const _AlternativePlan({
    required this.compact,
    required this.time,
    required this.description,
    required this.status,
    required this.statusColor,
  });

  final bool compact;
  final String time;
  final String description;
  final String status;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: EdgeInsets.all(compact ? 15 : 20),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        runSpacing: 10,
        spacing: 14,
        children: [
          Text(
            time,
            style: TextStyle(
              fontSize: compact ? 25 : 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(
            width: compact ? 180 : 210,
            child: Text(
              description,
              style: TextStyle(
                color: const Color(0xFF40506A),
                fontSize: compact ? 14 : 15,
                height: 1.35,
              ),
            ),
          ),
          StatusPill(
            label: status,
            color: statusColor,
            background: statusColor.withValues(alpha: 0.12),
          ),
        ],
      ),
    );
  }
}
