# Morelia Conecta · Dashboard

Dashboard operativo React/Vite/TypeScript para visualizar la red de movilidad de Morelia. Incluye las siete vistas del centro de control: resumen operativo, mapa en vivo, rutas, paradas y demanda, análisis histórico, calidad de datos y configuración.

## Ejecutar

```bash
cd dashboard
npm install
npm run dev
```

Producción local:

```bash
npm run build
npm run preview
```

La interfaz intenta cargar `http://localhost:3000/dashboard/overview` al iniciar. Si el backend no responde, conserva datos locales de demostración y muestra el estado **Modo demostración**. La integración de WebSocket (`/ws/mobility`) queda preparada para añadirse sin bloquear el modo demo.

## Notas

- Navegación persistida con hash (`#overview`, `#live`, etc.) para facilitar enlaces directos.
- El mapa es una composición SVG/CSS liviana, sin proveedor de mapas ni API key; las geometrías representan la red demo.
- Paleta basada en el sistema Morelia Conecta: tinta, crema, terracota, verde y ámbar.
- El backend y Docker no fueron modificados.
