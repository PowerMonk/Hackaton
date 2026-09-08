import 'package:flutter/material.dart';

enum RouteStatus { active, inactive }

class TransitRoute {
  const TransitRoute({
    required this.id,
    required this.name,
    required this.mode,
    required this.frequency,
    required this.eta,
    required this.color,
    required this.status,
    this.sharedSegment,
  });

  final String id;
  final String name;
  final String mode;
  final String frequency;
  final String eta;
  final Color color;
  final RouteStatus status;
  final String? sharedSegment;
}

class StopInfo {
  const StopInfo({
    required this.name,
    required this.detail,
    required this.eta,
    required this.kind,
  });

  final String name;
  final String detail;
  final String eta;
  final StopKind kind;
}

enum StopKind { passed, current, next, upcoming, terminal }
