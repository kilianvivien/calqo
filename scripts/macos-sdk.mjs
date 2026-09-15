#!/usr/bin/env node
// Share SDK selection between local Tauri builds and the release workflow.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);
if (process.platform !== 'darwin') {
  throw new Error('The macOS build requires Xcode on macOS.');
}

const run = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8' }).trim();
const sdkRoot = run('xcrun', ['--sdk', 'macosx', '--show-sdk-path']);
const sdkVersion = run('xcrun', ['--sdk', 'macosx', '--show-sdk-version']);
const config = JSON.parse(
  readFileSync(
    new URL('../src-tauri/tauri.conf.json', import.meta.url),
    'utf8',
  ),
);
const minimum = config.bundle.macOS.minimumSystemVersion;
if (Number(sdkVersion.split('.')[0]) < 27) {
  throw new Error(
    `macOS SDK 27 or newer is required; selected SDK is ${sdkVersion}. Select a newer Xcode with DEVELOPER_DIR or xcode-select.`,
  );
}

const environment = {
  SDKROOT: sdkRoot,
  MACOSX_DEPLOYMENT_TARGET: minimum,
};
console.log(`macOS SDK ${sdkVersion}; minimum macOS ${minimum}; ${sdkRoot}`);

if (mode === '--github-env') {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is not set.');
  appendFileSync(
    process.env.GITHUB_ENV,
    Object.entries(environment)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
} else if (mode === '--verify') {
  if (args.length !== 1)
    throw new Error('Pass the exact built Mach-O binary path.');
  const output = run('xcrun', ['vtool', '-show-build', args[0]]);
  console.log(output);
  const normalize = (version) =>
    version.split('.').map(Number).concat([0, 0]).slice(0, 3).join('.');
  const builds = [
    ...output.matchAll(/platform\s+MACOS\s+minos\s+([\d.]+)\s+sdk\s+([\d.]+)/g),
  ];
  if (
    builds.length !== 1 ||
    normalize(builds[0][1]) !== normalize(minimum) ||
    normalize(builds[0][2]) !== normalize(sdkVersion)
  ) {
    throw new Error(
      `Expected one macOS build with SDK ${sdkVersion} and minimum ${minimum}. Clean the Cargo target directory and rebuild if it is stale.`,
    );
  }
} else if (mode === '--build') {
  const result = spawnSync('pnpm', ['exec', 'tauri', 'build', ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  throw new Error(
    'Use --build [Tauri arguments], --github-env, or --verify <binary>.',
  );
}
