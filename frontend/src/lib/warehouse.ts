/**
 * Warehouse module — single entry point for screens.
 *
 * `import { … } from "@/lib/warehouse"` gives a page constants, types, reads and
 * writes without knowing how the layer is split. Re-exports only; no logic here.
 */
export * from "@/lib/warehouse.types";
export * from "@/lib/warehouse.entities";
export * from "@/lib/warehouse.queries";
export * from "@/lib/warehouse.mutations";
