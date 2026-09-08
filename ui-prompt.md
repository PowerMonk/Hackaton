# UI Design Prompt: Morelia Mobility App

Design a polished, production-quality mobile UI for a software-only public transportation app for Morelia, Michoacan.

The app turns consenting passengers' phones into distributed mobility sensors. A passenger selects a public transport route, receives a prompt when a nearby vehicle is detected, confirms that they boarded, and then contributes low-frequency location data. Other passengers use the resulting data to see reliable, confidence-aware ETAs.

Create a visual system that feels like a calm civic mobility product, not a generic Uber clone and not a government portal.

## Product Name

Use the working name:

```text
Morelia Conecta
```

You may propose a stronger name, but keep the product centered on trust, clarity and collective movement.

## Primary UX Principles

- Make the next transport decision obvious within two seconds.
- Keep the map useful without making the interface feel like a map-only product.
- Use progressive disclosure instead of showing every data point at once.
- Make boarding confirmation explicit and respectful.
- Explain uncertainty instead of pretending GPS is perfect.
- Make route selection prominent because several routes may share the same street.
- Never require a destination just to select a route.
- Keep all important actions reachable with one hand.
- Design for Android first, but keep the system portable to iOS later.
- Support poor connectivity, stale data and loading states.

## Visual Direction

Use a distinctive but restrained visual language:

- Warm off-white or very light sand background.
- Deep ink/navy text.
- A confident Morelia-inspired terracotta or coral accent.
- A fresh green for active and reliable movement.
- Amber for uncertain or stale information.
- Avoid excessive gradients, neon colors, glassmorphism and decorative 3D elements.
- Use generous spacing, strong hierarchy and readable typography.
- Use a modern grotesk or humanist sans-serif family.
- Rounded corners should be present but not exaggerated.
- Cards should support hierarchy, not turn the app into a dashboard of floating boxes.

The result should feel premium, fast and locally grounded, with the clarity of a transportation control surface and the warmth of a city service.

## Required Screens

### 1. Home Map

Show:

- Morelia map.
- Current user position.
- Route selector near the top.
- Bottom sheet with nearby stops and ETAs.
- Clear live/demo mode indicator.
- Connection state.
- A compact action for planning a trip.

The map must not be visually overwhelmed by markers. Prioritize the selected route and the nearest useful information.

### 2. Route Selection

Design a fast route-selection experience with:

- Search.
- Route color.
- Route name or number.
- Transport mode.
- Optional direction selector.
- Active/inactive state.
- Indication that several routes may overlap.

Destination selection is optional. A user must be able to select only a route and return to the map.

### 3. Route-Focused Map

After selecting a route:

- Dim unrelated routes.
- Highlight the selected route strongly.
- Show stops in sequence.
- Show nearby inferred vehicles.
- Indicate vehicle freshness and confidence.
- Make overlapping routes distinguishable without creating visual noise.

Use route color consistently across map, stop details, ETA cards and trip state.

### 4. Boarding Confirmation Prompt

When a nearby vehicle on the selected route is detected, show a high-quality contextual modal or bottom sheet:

```text
Ruta R12 cerca de ti
¿Ya subiste al transporte?
```

Actions:

- `Sí, ya estoy a bordo`
- `No subí`
- `Ahora no`

Explain briefly that confirming helps improve arrival information for other passengers. Do not use manipulative language.

Show enough context to build trust:

- Route.
- Nearby stop or area.
- Approximate vehicle distance.
- Confidence level.

### 5. Active Trip Mode

When the user confirms boarding, transform the interface into a calm active-trip state:

- Large route identifier.
- Current inferred position.
- Next stop.
- Progress along the route.
- Connection status.
- Last update time.
- Sampling status expressed in plain language.
- Manual `Bajarme` action.

Do not show technical GPS terminology unless it is hidden behind an information affordance.

Example copy:

```text
Estás ayudando a mejorar esta ruta
Última actualización hace 28 s
```

### 6. Stop Detail and ETA

Show:

- Stop name.
- Selected route.
- Next inferred vehicles.
- ETA as a range when confidence is low.
- Confidence indicator.
- Last update timestamp.
- Stale-data explanation when applicable.

Examples:

```text
4-6 min
Alta confianza
Actualizado hace 18 s
```

For stale data:

```text
Estimación con baja confianza
La unidad no reporta datos desde hace 3 min
```

### 7. Multimodal Trip Planner

Create a simple origin and destination flow supporting:

- Walking.
- Public transport.
- Walking plus public transport.
- Optional bicycle/non-motorized routes.

Provide preference controls:

- Más rápido.
- Más económico.
- Menos caminata.
- Menos transbordos.

Show route alternatives with:

- Total time.
- Walking time.
- Number of transfers.
- Estimated cost.
- Confidence of the public transport ETA.

Costs must be labeled as estimates. Do not show payment or card functionality.

### 8. Offline and Error States

Design polished states for:

- No connection.
- No nearby routes.
- No current vehicle data.
- GPS permission denied.
- Location unavailable.
- Stale ETA.
- Empty stop.
- Loading route data.
- Active trip with intermittent connectivity.

The user should always understand what happened and what action is available.

### 9. Demo Mode

Include a subtle but visible demo indicator when simulation is active:

```text
Modo demostración
```

The demo mode should look intentional and polished, not like a developer debug screen.

## Navigation

Propose a simple navigation model with no more than three primary destinations:

- Mapa.
- Planear.
- Mis viajes.

Keep active trip state persistent and easy to return to.

## Accessibility

Include:

- Strong color contrast.
- Large touch targets.
- Text alternatives for map information.
- Do not rely on color alone to represent confidence or route identity.
- Clear focus and pressed states.
- Spanish-language labels.
- Support for dynamic text sizing where possible.

## Design Deliverables

Produce:

1. A complete mobile information architecture.
2. A screen-by-screen high-fidelity visual direction.
3. A reusable color, typography and spacing system.
4. Button, chip, bottom sheet, card and status components.
5. Empty, loading, error, offline and stale-data variants.
6. Interaction flow for route selection and boarding confirmation.
7. A realistic Morelia map composition using placeholder route data.
8. A clear handoff description suitable for implementation in Flutter.

Do not generate Flutter code yet. Focus on the visual system, interaction quality and product decisions. Avoid generic AI-dashboard layouts, excessive cards, unnecessary decoration and features related to public transport cards or payments.
