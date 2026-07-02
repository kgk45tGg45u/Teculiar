// Ambient declarations so this package typechecks standalone (outside a Next app,
// which would otherwise supply these via next-env.d.ts).
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css";
