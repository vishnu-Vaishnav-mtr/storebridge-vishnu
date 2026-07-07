/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@storebridge/database",
    "@storebridge/shared",
    "@storebridge/logger",
    "@storebridge/migration-core",
    "@storebridge/woo-adapter",
    "@storebridge/wordpress-adapter",
    "@storebridge/shopify-adapter",
  ],
};

export default nextConfig;
