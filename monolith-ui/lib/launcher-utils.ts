import type { LoaderKind } from "./launcher-types";

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "item";

export const resolveLoaderLabel = (loader: LoaderKind | string) => {
  switch (loader) {
    case "vanilla":
      return "Vanilla";
    case "fabric":
      return "Fabric";
    case "forge":
      return "Forge";
    default:
      return loader || "Unknown";
  }
};
