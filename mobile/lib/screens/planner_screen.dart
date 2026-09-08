import 'package:flutter/material.dart';

import '../data/api_contracts.dart';
import '../data/mobility_api.dart';
import '../data/planner_local.dart';
import '../models/planner_models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui_components.dart';

class PlannerScreen extends StatefulWidget {
  const PlannerScreen({super.key, this.api});

  final MobilityApi? api;

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> {
  final originController = TextEditingController(
    text: 'Mi ubicación · Catedral',
  );
  final destinationController = TextEditingController(
    text: 'Hospital Ángeles Altozano',
  );

  late final MobilityApi api;
  var preference = 'Más rápido';
  var selectedMode = 'Transporte';
  String? activeField;
  AddressSuggestion? selectedOrigin;
  AddressSuggestion? selectedDestination;
  PlannerResult? result;
  String? errorMessage;
  String? fallbackMessage;
  var isLoading = false;

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
  void initState() {
    super.initState();
    api = widget.api ?? HttpMobilityApi();
    result = _localResult();
  }

  @override
  void dispose() {
    originController.dispose();
    destinationController.dispose();
    super.dispose();
  }

  PlannerResult _localResult() => PlannerLocalFallback.plan(
    origin: PlannerPlace(
      label: selectedOrigin?.label ?? originController.text,
      lat: selectedOrigin?.lat ?? 19.7029,
      lon: selectedOrigin?.lon ?? -101.1921,
    ),
    destination: PlannerPlace(
      label: selectedDestination?.label ?? destinationController.text,
      lat: selectedDestination?.lat ?? 19.6734,
      lon: selectedDestination?.lon ?? -101.1432,
    ),
    priority: _priorityValue,
    mode: selectedMode,
  );

  String get _priorityValue => switch (preference) {
    'Menos caminata' => 'least_walking',
    'Menos transbordos' => 'fewest_transfers',
    'Más económico' => 'cheapest',
    _ => 'fastest',
  };

  List<String> get _modes => switch (selectedMode) {
    'A pie' => ['walk'],
    'Bici' => ['bicycle'],
    _ => ['walk', 'transit'],
  };

  Future<void> _planRoute() async {
    final origin = selectedOrigin;
    final destination = selectedDestination;
    if (origin == null || destination == null) {
      final missingOrigin = origin == null;
      setState(() {
        errorMessage = missingOrigin
            ? 'Selecciona una sugerencia para el origen.'
            : 'Selecciona una sugerencia para el destino.';
        activeField = missingOrigin ? 'origin' : 'destination';
      });
      return;
    }

    final request = PlannerRequest(
      origin: PlannerPlace(
        label: origin.label,
        lat: origin.lat,
        lon: origin.lon,
      ),
      destination: PlannerPlace(
        label: destination.label,
        lat: destination.lat,
        lon: destination.lon,
      ),
      priority: _priorityValue,
      modes: _modes,
    );

    setState(() {
      isLoading = true;
      errorMessage = null;
      fallbackMessage = null;
    });

    if (ApiConfig.mode == AppMode.demo) {
      setState(() {
        result = _localResult();
        isLoading = false;
        fallbackMessage = 'Modo demo: mostrando un plan local provisional.';
      });
      return;
    }

    try {
      final response = await api.planRoute(request.toJson());
      final remoteResult = PlannerResult.fromJson(response);
      if (remoteResult.recommended == null) {
        throw const MobilityApiException('La API no devolvió una ruta');
      }
      if (!mounted) return;
      setState(() {
        result = remoteResult;
        isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        result = _localResult();
        isLoading = false;
        fallbackMessage =
            'No se pudo consultar el backend. Mostrando un plan local provisional.';
      });
    }
  }

  void _selectSuggestion(String field, AddressSuggestion suggestion) {
    setState(() {
      if (field == 'origin') {
        originController.text = suggestion.label;
        selectedOrigin = suggestion;
      } else {
        destinationController.text = suggestion.label;
        selectedDestination = suggestion;
      }
      activeField = null;
      errorMessage = null;
    });
  }

  void _changedField(String field, String value) {
    setState(() {
      activeField = field;
      if (field == 'origin' && selectedOrigin?.label != value) {
        selectedOrigin = null;
      }
      if (field == 'destination' && selectedDestination?.label != value) {
        selectedDestination = null;
      }
      errorMessage = null;
    });
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
                      onChanged: (value) => _changedField('origin', value),
                    ),
                    if (activeField == 'origin')
                      _SuggestionList(
                        query: originController.text,
                        suggestions: addressSuggestions,
                        onSelected: (suggestion) =>
                            _selectSuggestion('origin', suggestion),
                      ),
                    const Divider(height: 24),
                    _PlaceField(
                      controller: destinationController,
                      color: AppColors.terracotta,
                      title: 'Destino',
                      icon: Icons.swap_vert,
                      onTap: () => setState(() => activeField = 'destination'),
                      onChanged: (value) => _changedField('destination', value),
                    ),
                    if (activeField == 'destination')
                      _SuggestionList(
                        query: destinationController.text,
                        suggestions: addressSuggestions,
                        onSelected: (suggestion) =>
                            _selectSuggestion('destination', suggestion),
                      ),
                  ],
                ),
              ),
              if (errorMessage != null) ...[
                const SizedBox(height: 9),
                Text(
                  errorMessage!,
                  style: const TextStyle(
                    color: AppColors.terracotta,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              const _SectionLabel(label: 'Prioridad'),
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
              const _SectionLabel(label: 'Modo de viaje'),
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
              const SizedBox(height: 18),
              PrimaryButton(
                label: isLoading ? 'Calculando…' : 'Calcular ruta',
                icon: Icons.alt_route,
                onPressed: isLoading ? () {} : _planRoute,
              ),
              if (isLoading) ...[
                const SizedBox(height: 10),
                const LinearProgressIndicator(),
              ],
              if (fallbackMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  fallbackMessage!,
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ],
              if (result != null) ...[
                const SizedBox(height: 16),
                _PlannerResults(result: result!, compact: compact),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _PlannerResults extends StatelessWidget {
  const _PlannerResults({required this.result, required this.compact});

  final PlannerResult result;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final recommended = result.recommended;
    if (recommended == null) {
      return const Text('No encontramos una ruta para esos puntos.');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _RecommendedPlan(option: recommended, compact: compact),
        for (final alternative in result.alternatives) ...[
          const SizedBox(height: 12),
          _AlternativePlan(option: alternative, compact: compact),
        ],
        if (result.warnings.isNotEmpty) ...[
          const SizedBox(height: 14),
          SoftCard(
            padding: EdgeInsets.all(compact ? 14 : 17),
            color: const Color(0xFFFFF7E5),
            borderColor: AppColors.amber.withValues(alpha: 0.35),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, color: AppColors.amber),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Advertencias provisionales',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 5),
                      for (final warning in result.warnings)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Text(warning),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        const Center(
          child: Text(
            'Costos estimados, pueden variar. Sin pagos en la app.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.muted, fontSize: 14),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: const TextStyle(
      color: AppColors.muted,
      fontSize: 14,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.4,
    ),
  );
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
  Widget build(BuildContext context) => Row(
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
    final matches = suggestions
        .where(
          (suggestion) =>
              suggestion.label.toLowerCase().contains(normalized) ||
              suggestion.detail.toLowerCase().contains(normalized),
        )
        .toList();
    final visible = matches.isEmpty ? suggestions : matches;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        color: AppColors.creamDark,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          if (matches.isEmpty && normalized.isNotEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(14, 10, 14, 2),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Elige uno de estos puntos guardados:',
                  style: TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ),
            ),
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
  Widget build(BuildContext context) => Material(
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
  const _RecommendedPlan({required this.option, required this.compact});

  final PlannerOption option;
  final bool compact;

  @override
  Widget build(BuildContext context) => Container(
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
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
              '${option.durationMinutes} min',
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
            _PlanMetric(
              label: '${option.walkingMinutes} min',
              detail: 'caminata',
              light: true,
            ),
            _RouteLabel(route: option.routeLabel),
            Text(
              option.transfers == 0
                  ? 'Sin transbordos'
                  : '${option.transfers} transbordos',
              style: const TextStyle(color: Colors.white70, fontSize: 15),
            ),
          ],
        ),
        const Divider(color: Colors.white24, height: 28),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          runSpacing: 10,
          spacing: 10,
          children: [
            Text(
              'Costo estimado ${option.costLabel}',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
            _ConfidencePill(confidence: option.confidence, dark: true),
          ],
        ),
      ],
    ),
  );
}

class _AlternativePlan extends StatelessWidget {
  const _AlternativePlan({required this.option, required this.compact});

  final PlannerOption option;
  final bool compact;

  @override
  Widget build(BuildContext context) => SoftCard(
    padding: EdgeInsets.all(compact ? 15 : 20),
    child: Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      alignment: WrapAlignment.spaceBetween,
      runSpacing: 10,
      spacing: 14,
      children: [
        Text(
          '${option.durationMinutes} min',
          style: TextStyle(
            fontSize: compact ? 25 : 28,
            fontWeight: FontWeight.w800,
          ),
        ),
        SizedBox(
          width: compact ? 180 : 210,
          child: Text(
            '${option.walkingMinutes} min caminando · ${option.routeLabel} · '
            '${option.transfers} transbordos · ${option.costLabel}',
            style: TextStyle(
              color: const Color(0xFF40506A),
              fontSize: compact ? 14 : 15,
              height: 1.35,
            ),
          ),
        ),
        _ConfidencePill(confidence: option.confidence),
      ],
    ),
  );
}

class _PlanMetric extends StatelessWidget {
  const _PlanMetric({
    required this.label,
    required this.detail,
    this.light = false,
  });

  final String label;
  final String detail;
  final bool light;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          color: light ? Colors.white : AppColors.ink,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
      Text(
        detail,
        style: TextStyle(
          color: light ? Colors.white70 : AppColors.muted,
          fontSize: 12,
        ),
      ),
    ],
  );
}

class _RouteLabel extends StatelessWidget {
  const _RouteLabel({required this.route});

  final String route;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    decoration: BoxDecoration(
      color: AppColors.terracotta,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Text(
      route,
      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
    ),
  );
}

class _ConfidencePill extends StatelessWidget {
  const _ConfidencePill({required this.confidence, this.dark = false});

  final String confidence;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final normalized = confidence.toLowerCase();
    final color = normalized == 'high' || normalized == 'alta'
        ? AppColors.green
        : normalized == 'medium' || normalized == 'media'
        ? AppColors.amber
        : AppColors.muted;
    final label = normalized == 'high'
        ? 'Alta'
        : normalized == 'medium'
        ? 'Media'
        : normalized == 'low'
        ? 'Baja'
        : confidence;
    return StatusPill(
      label: label,
      color: color,
      background: dark ? Colors.white : color.withValues(alpha: 0.12),
    );
  }
}
