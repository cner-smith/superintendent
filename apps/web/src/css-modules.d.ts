/**
 * css-modules.d.ts — ambient type declarations for CSS Module imports.
 *
 * Called by: App.tsx, MapView.tsx, IndexSwitcher.tsx, Toast.tsx, ZoneForm.tsx
 * No existing duplicate declaration file found.
 * Instruction: build the v0.1 map + zone-drawing UI
 * Data structure: Record<string, string> — CSS module class map
 */
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
