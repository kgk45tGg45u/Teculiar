// Convenience barrel for the shared web core. Most consumers import via explicit
// subpaths (e.g. `@teculiar/web-core/lib/api`, `@teculiar/web-core/components/ui/button`),
// which map 1:1 onto this package's source tree; this barrel re-exports the two most
// widely used modules for ergonomics.
export * from "./lib/api";
