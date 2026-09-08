# Contrato de integracion en vivo

Este documento define la capa compartida para la siguiente fase de Morelia
Conecta. El contrato TypeScript esta en
`backend/src/types/mobility-contracts.ts`. Describe el JSON de transporte y no
modifica los modelos de persistencia existentes.

## Convenciones

| Campo o concepto | Convencion |
| --- | --- |
| `timestamp`, `startedAt`, `endedAt`, `lastSampleAt`, `lastUpdateAt`, `calculatedAt` | Unix epoch en milisegundos, UTC |
| `speedMps` | Velocidad de entrada del telefono, metros por segundo |
| `speed`, `currentSpeed`, `inferredSpeedKmh` | Velocidad persistida o derivada, kilometros por hora |
| `accuracy`, `distanceMeters`, `totalDistanceMeters` | Metros |
| `progress`, `currentProgress` | Fraccion de la geometria de ruta, siempre en `0..1` |
| `lat`, `lon` | Grados decimales WGS84; `lon` es longitud |
| `heading` | Grados, sentido horario desde el norte |

Los `Date` del modelo actual (`backend/src/types/index.ts`) se serializan como
Unix ms en estos DTOs. El adaptador de persistencia convierte `speedMps` a
km/h multiplicando por `3.6` antes de guardar.

## Tipos principales

- `LocationSample`: muestra de ubicacion que entra por `POST /locations`.
- `RouteMatch`: resultado de asociar una muestra con una ruta.
- `BoardingSessionDto`: representacion JSON de `BoardingSession`.
- `NearbyVehicle`: snapshot de un vehiculo con distancia y ETA opcional.
- `VirtualVehicleUpdate`: snapshot usado por HTTP y WebSocket.
- `EtaInfo`: equivalente de transporte para `EtaResult`.
- `MobilityWebSocketEvent`: union discriminada de eventos del stream.
- `RoutePlanResult`: resultado compatible con el `RoutePlanResult` actual.

## POST /boarding-sessions

Request:

```json
{
  "routeId": "ruta-12",
  "deviceId": "device-demo-01",
  "isSimulated": false
}
```

Response `201 Created`:

```json
{
  "id": "session-01",
  "routeId": "ruta-12",
  "deviceId": "device-demo-01",
  "startedAt": 1778323200000,
  "endedAt": null,
  "currentState": "WAITING",
  "currentProgress": 0,
  "currentSpeed": 0,
  "lastSampleAt": null,
  "virtualVehicleId": null,
  "isSimulated": false
}
```

`currentSpeed` es km/h aunque `speedMps` es la unidad de entrada de
ubicaciones.

## POST /locations

Request:

```json
{
  "sessionId": "session-01",
  "timestamp": 1778323265123,
  "lat": 19.7021,
  "lon": -101.1924,
  "accuracy": 8.5,
  "speedMps": 4.2,
  "heading": 90,
  "isSimulated": false
}
```

Response `201 Created`:

```json
{
  "sessionId": "session-01",
  "timestamp": 1778323265123,
  "lat": 19.7021,
  "lon": -101.1924,
  "accuracy": 8.5,
  "speedMps": 4.2,
  "heading": 90,
  "isSimulated": false,
  "routeMatch": {
    "routeId": "ruta-12",
    "distanceMeters": 18.4,
    "progress": 0.42
  },
  "inferredSpeedKmh": 15.12,
  "mobilityState": "IN_TRANSIT"
}
```

Cuando no hay una ruta dentro del radio de matching, `routeMatch` es `null` y
los valores derivados de ruta deben permanecer nulos.

## GET /nearby

Query recomendada: `/nearby?lat=19.7021&lon=-101.1924&radiusMeters=500`.
`routeId` puede agregarse para filtrar una ruta.

Response `200 OK`:

```json
{
  "timestamp": 1778323267000,
  "count": 1,
  "vehicles": [
    {
      "id": "veh-ruta-12-01",
      "routeId": "ruta-12",
      "progress": 0.38,
      "speed": 21.6,
      "heading": 88,
      "passengerCount": 17,
      "confidence": "Alta",
      "currentPosition": {
        "lat": 19.705,
        "lon": -101.194
      },
      "lastUpdateAt": 1778323266500,
      "isSimulated": true,
      "distanceMeters": 342,
      "eta": {
        "minMinutes": 2,
        "maxMinutes": 4,
        "label": "2-4 min",
        "confidence": "Alta",
        "vehicleId": "veh-ruta-12-01",
        "stale": false,
        "calculatedAt": 1778323267000
      }
    }
  ]
}
```

En este contrato `speed` es km/h y `distanceMeters` es la distancia desde el
punto consultado, no la distancia recorrida por el vehiculo.

## GET /stops/:id/eta

Request: `/stops/stop-centro/eta?routeId=ruta-12`.

Response `200 OK`:

```json
{
  "stopId": "stop-centro",
  "eta": {
    "minMinutes": 5,
    "maxMinutes": 10,
    "label": "5-10 min",
    "confidence": "Media",
    "vehicleId": "veh-ruta-12-01",
    "stale": false,
    "calculatedAt": 1778323267000
  },
  "source": "simulation"
}
```

`eta` puede ser `null` cuando no hay vehiculos o no existe la parada. Un ETA
con `stale: true` sigue siendo util como estimacion, pero la interfaz debe
mostrar que no es reciente.

## WebSocket /ws/mobility

El servidor envia eventos con la forma `{ type, payload, timestamp }`. El
cliente puede enviar `subscribe`, `unsubscribe` o `ping`:

```json
{
  "type": "subscribe",
  "routeId": "ruta-12"
}
```

Ejemplo de evento `vehicle_update`:

```json
{
  "type": "vehicle_update",
  "timestamp": 1778323268000,
  "payload": {
    "routeId": "ruta-12",
    "vehicles": [
      {
        "id": "veh-ruta-12-01",
        "routeId": "ruta-12",
        "progress": 0.41,
        "speed": 20.8,
        "heading": 90,
        "passengerCount": 18,
        "confidence": "Alta",
        "currentPosition": {
          "lat": 19.7054,
          "lon": -101.1945
        },
        "lastUpdateAt": 1778323267950,
        "isSimulated": true
      }
    ]
  }
}
```

Otros eventos cubiertos por `MobilityWebSocketEvent` son `connected`,
`subscribed`, `unsubscribed`, `eta_update`, `session_start`, `session_end`,
`simulation_tick`, `pong` y `error`. Todos los timestamps del evento y de sus
payloads usan Unix ms UTC.

## Compatibilidad con los tipos actuales

- `RouteMatch.routeId`, `progress` y `distanceMeters` corresponden a
  `matchedRouteId`, `routeProgress` y `distanceFromRoute` de `ProcessedSample`.
- `inferredSpeedKmh` corresponde a `inferredSpeed`; ambos representan km/h en
  persistencia.
- `VirtualVehicleUpdate` conserva `id`, `routeId`, `progress`, `speed`,
  `heading`, `passengerCount`, `confidence` y `currentPosition` de
  `VirtualVehicle`; solo normaliza `lastUpdateAt` a Unix ms para JSON.
- `EtaInfo` conserva los campos de `EtaResult`; solo normaliza
  `calculatedAt` a Unix ms para JSON.
- `RoutePlanResult` reutiliza la forma de `RoutePlanResult` y `RouteLeg` ya
  existentes, con distancias en metros y duraciones en segundos.

No se agregan fixtures porque los ejemplos de este documento cubren cada
mensaje del contrato y no requieren datos persistidos.
