import manifest from "../../../../fixtures/catalog/manifest.json";
// Display-only canonical metadata; no pricing/tax policy or calculation engine.
export const presentation = { start: manifest.demo_start_date, cleaningMinor: manifest.sample_summary_lines.cleaning_minor, taxMinor: manifest.sample_summary_lines.tax_minor } as const;
