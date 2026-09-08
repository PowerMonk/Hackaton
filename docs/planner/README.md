# Planner OSM local y backend

`backend/src/services/planner.ts` es un motor puro y determinista. No consulta
PostGIS, OSRM, la hora actual ni una API externa.

## Entrada

`planProvisionalRoutes(request, dataset)` recibe lugares con coordenadas y un
dataset normalizado:

- `PlannerStop.routeIds` conecta las paradas con las rutas actuales.
- `PlannerRoute.stopIds` es opcional ahora y puede llenarse con el orden de
  `stop_times.txt` al importar GTFS.
- `PlannerCoverage` declara la fuente y si la cobertura de paradas es completa.

La fuente OSM actual debe declarar `source: "osm-demo"`, `knownStops: 39` y
`complete: false`. El motor no interpreta esos puntos como GTFS oficial.

## Comportamiento

- Busca candidatos dentro de un radio configurable en origen y destino.
- Genera caminata directa y alternativas de transporte directo sin inventar
  horarios ni tiempos de espera.
- Calcula caminata como Haversine multiplicada por
  `walkingDistanceFactor` (por defecto `1.25`).
- Ordena por `fastest`, `cheapest`, `least_walking` o `fewest_transfers`.
- Devuelve `recommended`, `alternatives` y metadata de confianza/provisionalidad.
- Puede devolver una caminata completa cuando no existe conexion directa.

Las tarifas y velocidades son estimaciones configurables. La confianza actual
es `low` porque las 39 paradas son incompletas y no hay horarios oficiales.

## Cliente offline

La app Flutter usa `mobile/lib/data/planner_geo.dart` en `DEMO_MODE`. Carga las
124 rutas y las paradas del GeoJSON incluido, genera alternativas directas y
combinaciones de hasta un transbordo, y conserva una caminata completa como
fallback. Sigue siendo estimado porque el dataset no contiene horarios GTFS.

## OSRM opcional

El backend usa `OSRM_BASE_URL` para caminar y bicicleta y vuelve a Haversine si
OSRM no responde. Para usar una instancia local, prepara un extract de OSM de
Michoacán con las imágenes oficiales de OSRM:

```bash
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/michoacan-latest.osm.pbf
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend:latest \
  osrm-partition /data/michoacan-latest.osrm
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend:latest \
  osrm-customize /data/michoacan-latest.osrm
docker compose --profile osrm up -d osrm
```

El archivo `.osm.pbf` no se incluye por su tamaño. El perfil puede omitirse en
la demo; el proveedor público y el fallback mantienen funcionando el planner.

## Integracion backend

El adaptador de `POST /route-plans` debe cargar el dataset desde PostGIS,
mapear sus `Route`/`Stop` a estos tipos locales, invocar el motor y adaptar
`recommended`/`alternatives` al contrato HTTP. Esa integracion queda separada
del motor para poder sustituir el dataset por GTFS sin cambiar el ranking.
