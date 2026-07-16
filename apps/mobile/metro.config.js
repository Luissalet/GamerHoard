// Expo Metro config. Works standalone (npm install inside apps/mobile) and in the
// monorepo (npm install at the repo root, deps hoisted).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// supabase-js imports optional telemetry deps (@opentelemetry/api) that aren't needed
// on React Native / web. Point them at an empty module so Metro can bundle.
const EMPTY = path.resolve(projectRoot, 'stubs/empty.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api' || moduleName.startsWith('@opentelemetry/')) {
    return { type: 'sourceFile', filePath: EMPTY };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
