import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:morelia_conecta/main.dart';
import 'package:morelia_conecta/screens/map_screen.dart';

void main() {
  testWidgets('shows route selection on launch', (tester) async {
    await tester.pumpWidget(const MoreliaConectaApp());

    expect(find.text('Elige tu ruta'), findsOneWidget);
    expect(find.byTooltip('Ver en el mapa'), findsOneWidget);
    expect(find.text('R12'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Cerca de mí'), findsOneWidget);
    expect(find.text('Combis'), findsOneWidget);
    expect(find.text('Camiones'), findsOneWidget);
  });

  testWidgets('can focus a route on the map', (tester) async {
    await tester.pumpWidget(const MoreliaConectaApp());

    final routeCard = find.byType(SelectableRouteCard).first;
    await tester.ensureVisible(routeCard);
    await tester.tap(routeCard);
    await tester.pump();

    final viewMapButton = find.byTooltip('Ver en el mapa');
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await tester.pump();
    expect(viewMapButton, findsOneWidget);
    await tester.tap(viewMapButton);
    await tester.pump();

    expect(find.text('Abordaje flexible'), findsOneWidget);
    expect(find.textContaining('min'), findsWidgets);
  });

  testWidgets('map button opens a general map without route selection', (
    tester,
  ) async {
    await tester.pumpWidget(const MoreliaConectaApp());

    await tester.tap(find.byTooltip('Ver en el mapa'));
    await tester.pump();

    expect(find.text('Mapa de Morelia'), findsOneWidget);
    expect(
      find.text(
        'Selecciona una ruta para ver su recorrido y las unidades disponibles.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('can open planner tab', (tester) async {
    await tester.pumpWidget(const MoreliaConectaApp());

    await tester.tap(find.text('Planear'));
    await tester.pump();

    expect(find.text('¿A dónde vamos?'), findsOneWidget);
    expect(find.text('Más rápido'), findsOneWidget);
  });

  testWidgets(
    'planner fields and preferences are interactive on compact screens',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 640));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MoreliaConectaApp());
      await tester.tap(find.text('Planear'));
      await tester.pump();

      final fields = find.byType(TextField);
      expect(fields, findsNWidgets(2));
      await tester.enterText(fields.at(1), 'Centro histórico');
      expect(find.text('Centro histórico'), findsOneWidget);

      await tester.tap(find.text('Más económico'));
      await tester.pump();
      expect(find.text('Más económico'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('route selection keeps map action visible on compact screens', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MoreliaConectaApp());
    await tester.ensureVisible(find.byType(SelectableRouteCard).first);
    await tester.tap(find.byType(SelectableRouteCard).first);
    await tester.pump();

    expect(find.byTooltip('Ver en el mapa'), findsOneWidget);
    expect(find.text('Cerca de mí'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('boarding sheet is scrollable on compact screens', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MoreliaConectaApp());
    await tester.ensureVisible(find.byType(SelectableRouteCard).first);
    await tester.tap(
      find.byType(SelectableRouteCard).first,
      warnIfMissed: false,
    );
    await tester.pump();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await tester.pump();
    await tester.tap(find.byTooltip('Ver en el mapa'));
    await tester.pump();
    await tester.tap(find.textContaining('min').first);
    await tester.pumpAndSettle();

    expect(find.text('¿Ya subiste al transporte?'), findsOneWidget);
    expect(find.text('Sí, ya estoy a bordo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('active trip has back affordance and does not trap user', (
    tester,
  ) async {
    await tester.pumpWidget(const MoreliaConectaApp());
    await tester.ensureVisible(find.byType(SelectableRouteCard).first);
    await tester.tap(
      find.byType(SelectableRouteCard).first,
      warnIfMissed: false,
    );
    await tester.pump();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await tester.pump();
    await tester.tap(find.byTooltip('Ver en el mapa'));
    await tester.pump();
    await tester.tap(find.textContaining('min').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Sí, ya estoy a bordo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sí, ya estoy a bordo'));
    await tester.pumpAndSettle();

    expect(find.text('Viaje activo'), findsOneWidget);
    expect(find.byTooltip('Volver al mapa'), findsOneWidget);
    expect(find.text('Bajarme'), findsOneWidget);

    await tester.tap(find.byTooltip('Volver al mapa'));
    await tester.pump();
    // Minimizar vuelve al mapa en vez de cerrar la app.
    expect(find.text('Abordaje flexible'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
