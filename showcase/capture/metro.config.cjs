const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const root = process.cwd();
const config = getDefaultConfig(root);
const dir = process.env.ANTE_CAPTURE_DIR;
if (dir) {
  config.watchFolders = [...(config.watchFolders ?? []), dir];
  config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.join(root, "node_modules")];
  const swaps = { "src/lib/position.ts": "web-position.ts", "src/lib/notifications.ts": "web-notifications.ts" };
  const upstream = config.resolver.resolveRequest;
  const resolve = (context, moduleName, platform) => (upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform));
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform !== "web") return resolve(context, moduleName, platform);
    if (moduleName === "expo-file-system" || moduleName.startsWith("expo-file-system/")) return { type: "sourceFile", filePath: path.join(dir, "web-file-system.js") };
    const result = resolve(context, moduleName, platform);
    const swap = result.type === "sourceFile" && swaps[path.relative(root, result.filePath)];
    if (swap) return { type: "sourceFile", filePath: path.join(dir, swap) };
    return result;
  };
  console.log("[capture] web shims from " + dir);
}
module.exports = config;
