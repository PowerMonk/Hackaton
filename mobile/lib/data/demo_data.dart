import 'package:flutter/material.dart';

import '../models/app_models.dart';

const demoRoutes = <TransitRoute>[
  TransitRoute(
    id: 'R12',
    name: 'Santa María — Centro',
    mode: 'Combi',
    frequency: 'Cada 6 min',
    eta: '4-6 min',
    color: Color(0xFFC94C28),
    status: RouteStatus.active,
    sharedSegment: 'Comparte tramo en Madero',
  ),
  TransitRoute(
    id: 'R07',
    name: 'Villas — Catedral',
    mode: 'Micro',
    frequency: 'Cada 9 min',
    eta: '7 min',
    color: Color(0xFF158D8E),
    status: RouteStatus.active,
    sharedSegment: 'Comparte tramo en Madero',
  ),
  TransitRoute(
    id: 'R21',
    name: 'Lomas — Mercado Independencia',
    mode: 'Camión',
    frequency: 'Cada 12 min',
    eta: '9-13 min',
    color: Color(0xFF294975),
    status: RouteStatus.active,
  ),
  TransitRoute(
    id: 'R03',
    name: 'Expropiación — Av. Universidad',
    mode: 'Combi',
    frequency: 'Sin datos en vivo',
    eta: '—',
    color: Color(0xFFD29A14),
    status: RouteStatus.inactive,
  ),
];

const demoStops = <StopInfo>[
  StopInfo(
    name: 'Santa María (base)',
    detail: 'Pasó hace 6 min',
    eta: '',
    kind: StopKind.passed,
  ),
  StopInfo(
    name: 'Jardín Villalongín',
    detail: 'Tú estás aquí · 120 m',
    eta: '',
    kind: StopKind.current,
  ),
  StopInfo(
    name: 'Catedral · Portal Hidalgo',
    detail: 'Llega en 4-6 min',
    eta: 'Próxima',
    kind: StopKind.next,
  ),
  StopInfo(
    name: 'Mercado Independencia',
    detail: 'Llega en 11-14 min',
    eta: '',
    kind: StopKind.upcoming,
  ),
  StopInfo(
    name: 'Av. Universidad (terminal)',
    detail: 'Llega en ~20 min',
    eta: '',
    kind: StopKind.terminal,
  ),
];
