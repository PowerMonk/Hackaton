import 'package:flutter/material.dart';

import 'screens/map_screen.dart';
import 'screens/planner_screen.dart';
import 'screens/service_status_screen.dart';
import 'screens/trips_screen.dart';
import 'theme/app_theme.dart';
import 'widgets/ui_components.dart';

void main() {
  runApp(const MoreliaConectaApp());
}

class MoreliaConectaApp extends StatelessWidget {
  const MoreliaConectaApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Morelia Conecta',
    debugShowCheckedModeBanner: false,
    theme: buildAppTheme(),
    home: const AppShell(),
  );
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  var currentIndex = 0;

  void _selectTab(int index) => setState(() => currentIndex = index);

  @override
  Widget build(BuildContext context) {
    final pages = [
      MapScreen(onOpenService: _openService),
      const PlannerScreen(),
      TripsScreen(onOpenActiveTrip: () => _selectTab(0)),
    ];
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: currentIndex, children: pages),
      ),
      bottomNavigationBar: AppBottomBar(
        currentIndex: currentIndex,
        onSelected: _selectTab,
      ),
    );
  }

  void _openService() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const ServiceStatusScreen()),
    );
  }
}
