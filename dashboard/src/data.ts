export type View = 'overview' | 'live' | 'routes' | 'stops' | 'analytics' | 'quality' | 'settings'
export type Position = { lat: number; lon: number }
export type Vehicle = { id: string; route: string; position: Position; speed: number; passengers: number; confidence: number; lastUpdate: string; progress?: number }
export type Route = { id: string; name: string; color: string; geometry?: { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] }; units: number; avgSpeed: number; confidence: number; status: string }
export type Stop = { id: string; name: string; coordinates: Position; routeIds: string[]; demand: number; confidence: string }
export type DashboardData = { connected: boolean; overview: Record<string, unknown>; vehicles: Vehicle[]; routes: Route[]; stops: Stop[]; history: unknown[]; quality: Record<string, unknown>; alerts: Array<{ id: string; title: string; message: string; severity: string }> }

export const demoRoutes: Route[] = [
  { id: 'R12', name: 'Centro · Xangari', color: '#C94C28', units: 18, avgSpeed: 23, confidence: 92, status: 'En servicio' },
  { id: 'R04', name: 'Obrera · Camelinas', color: '#176B48', units: 12, avgSpeed: 19, confidence: 89, status: 'En servicio' },
  { id: 'R18', name: 'Tarímbaro · Centro', color: '#A87300', units: 9, avgSpeed: 14, confidence: 76, status: 'Atención' },
  { id: 'R21', name: 'San Juan · Altozano', color: '#7257A8', units: 14, avgSpeed: 21, confidence: 94, status: 'En servicio' },
  { id: 'R33', name: 'Villas · Mercado', color: '#2B82A0', units: 7, avgSpeed: 11, confidence: 68, status: 'Sin señal' },
]
export const demoVehicles: Vehicle[] = [
  { id: 'MC-204', route: 'R12', position: { lat: 19.702, lon: -101.19 }, speed: 24, passengers: 22, confidence: 94, lastUpdate: new Date().toISOString(), progress: .29 },
  { id: 'MC-118', route: 'R04', position: { lat: 19.695, lon: -101.16 }, speed: 18, passengers: 14, confidence: 88, lastUpdate: new Date().toISOString(), progress: .55 },
  { id: 'MC-087', route: 'R18', position: { lat: 19.71, lon: -101.17 }, speed: 0, passengers: 31, confidence: 72, lastUpdate: new Date(Date.now() - 60000).toISOString(), progress: .67 },
  { id: 'MC-301', route: 'R21', position: { lat: 19.687, lon: -101.18 }, speed: 20, passengers: 11, confidence: 96, lastUpdate: new Date().toISOString(), progress: .78 },
]
export const weeklyDemand = [54, 62, 58, 71, 82, 76, 68, 88, 92, 84, 76, 69]

const base = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const asArray = (value: any, key: string) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : []
const num = (v: any, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
const confidenceValue = (value: any) => {
  if (typeof value === 'number') return value
  if (value === 'Alta') return 90
  if (value === 'Media') return 70
  if (value === 'Baja') return 45
  return 0
}

function normalizeVehicle(v: any): Vehicle {
  const p = v.position || v.currentPosition || {}
  return { id: String(v.vehicleId ?? v.id ?? '—'), route: String(v.routeId ?? v.route ?? '—'), position: { lat: num(p.lat), lon: num(p.lon ?? p.lng) }, speed: num(v.speed), passengers: num(v.passengerCount ?? v.passengers), confidence: confidenceValue(v.confidence), lastUpdate: v.lastUpdate ?? v.lastUpdateAt ?? new Date().toISOString(), progress: num(v.progress) }
}
function normalizeRoute(r: any): Route {
  return { id: String(r.id ?? r.ref), name: r.name ?? r.id, color: r.color || '#C94C28', geometry: r.geometry, units: num(r.vehicles), avgSpeed: num(r.avgSpeed ?? r.avg_speed), confidence: confidenceValue(r.confidence), status: r.status ?? 'En servicio' }
}
function normalizeStop(s: any): Stop {
  const p = s.coordinates || { lat: s.lat, lon: s.lon }
  return { id: String(s.id ?? s.name), name: s.name ?? s.id, coordinates: { lat: num(p.lat), lon: num(p.lon ?? p.lng) }, routeIds: s.routeIds || [], demand: num(s.estimatedDemand ?? s.demand), confidence: s.confidence ?? 'Baja' }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const fallback: DashboardData = { connected: false, overview: { activeVehicles: demoVehicles.length, totalPassengers: 78, avgSpeed: 18, activeRoutes: demoRoutes.length, totalRoutes: demoRoutes.length, totalStops: 39 }, vehicles: demoVehicles, routes: demoRoutes, stops: ['Mercado Independencia', 'Las Américas', 'Héroes de Nocupétaro', 'Tres Puentes', 'Ciudad Universitaria', 'Xangari'].map((name, i) => ({ id: `demo-${i}`, name, coordinates: { lat: 19.7 + i * .004, lon: -101.19 + i * .006 }, routeIds: ['R12'], demand: [84, 72, 68, 55, 49, 43][i], confidence: 'Media' })), history: [], quality: { freshness: 91.6, accuracy: 89, coverage: 94 }, alerts: [] }
  const urls = ['/dashboard/overview', '/dashboard/vehicles', '/routes', '/stops', '/dashboard/history', '/dashboard/data-quality', '/dashboard/alerts']
  const responses = await Promise.all(urls.map(path => fetch(`${base()}${path}`, { signal: AbortSignal.timeout(2500) }).catch(() => null)))
  const json = await Promise.all(responses.map(async r => r?.ok ? r.json().catch(() => null) : null))
  const [overview, vehicles, routes, stops, history, quality, alerts] = json
  const gotApiData = responses.some(r => r?.ok)
  return { connected: gotApiData, overview: overview || fallback.overview, vehicles: vehicles ? asArray(vehicles, 'vehicles').map(normalizeVehicle) : fallback.vehicles, routes: routes ? asArray(routes, 'routes').map(normalizeRoute) : fallback.routes, stops: stops ? asArray(stops, 'stops').map(normalizeStop) : fallback.stops, history: history ? asArray(history, 'points') : fallback.history, quality: quality || fallback.quality, alerts: alerts ? asArray(alerts, 'alerts') : fallback.alerts }
}
export const apiBase = base
