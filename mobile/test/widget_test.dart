import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:morelia_conecta/main.dart';
import 'package:morelia_conecta/screens/map_screen.dart';

void main() {
  testWidgets('shows route selection on launch', (tester) async {
    await tester.pumpWidget(const MoreliaConectaApp());

    expect(find.text('Elige tu ruta'), findsOneWidget);
    expect(find.text('Ver en el mapa'), findsOneWidget);
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

    final viewMapButton = find.text('Ver en el mapa');
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await tester.pump();
    expect(viewMapButton, findsOneWidget);
    await tester.tap(viewMapButton);
    await tester.pump();

    expect(find.text('Paradas en secuencia'), findsOneWidget);
    expect(find.text('Unidad a 350 m de ti'), findsOneWidget);
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

    expect(find.text('Ver en el mapa'), findsOneWidget);
    expect(find.text('Cerca de mí'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
