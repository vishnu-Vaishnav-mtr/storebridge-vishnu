export type MigrationModuleKey =
  | "products"
  | "variants"
  | "collections"
  | "inventory"
  | "productImages"
  | "customers"
  | "customerAddresses"
  | "orders"
  | "refunds"
  | "discounts"
  | "pages"
  | "blogPosts"
  | "media"
  | "reviews"
  | "metafields"
  | "seo"
  | "redirects"
  | "customFields";

const DEPENDENCIES: Record<MigrationModuleKey, MigrationModuleKey[]> = {
  products: [],
  variants: ["products"],
  collections: [],
  inventory: ["products", "variants"],
  productImages: ["products"],
  customers: [],
  customerAddresses: ["customers"],
  orders: ["customers", "products"],
  refunds: ["orders"],
  discounts: [],
  pages: [],
  blogPosts: [],
  media: [],
  reviews: ["products"],
  metafields: ["products"],
  seo: ["products", "pages", "blogPosts"],
  redirects: ["seo"],
  customFields: [],
};

export function enforceModuleDependencies(
  selected: MigrationModuleKey[],
): MigrationModuleKey[] {
  const result = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const module of Array.from(result)) {
      for (const dependency of DEPENDENCIES[module]) {
        if (!result.has(dependency)) {
          result.add(dependency);
          changed = true;
        }
      }
    }
  }
  return Array.from(result);
}

export function missingDependencies(
  selected: MigrationModuleKey[],
): Array<{ module: MigrationModuleKey; dependency: MigrationModuleKey }> {
  const selectedSet = new Set(selected);
  return selected.flatMap((module) =>
    DEPENDENCIES[module]
      .filter((dependency) => !selectedSet.has(dependency))
      .map((dependency) => ({ module, dependency })),
  );
}
