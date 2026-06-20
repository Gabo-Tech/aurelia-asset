Remove the background-colored stroke/halo from the pie-chart labels in `src/routes/dashboard.tsx`.

1. In the `LabelledSector` component, strip the `paintOrder`, `stroke`, and `strokeWidth` inline styles from the two `<text>` elements that render the label name and percentage.
2. Keep the existing fonts, colors, positions, and leader lines unchanged so the chart remains readable.
3. Verify the labels no longer have a visible white/light border.

Scope: a single UI-only change in `src/routes/dashboard.tsx`. No backend or data changes.