// electron-builder afterPack hook: ad-hoc code signing of the macOS bundle.
//
// The installers are built without an Apple developer identity, so
// electron-builder leaves the .app unsigned. On macOS 15 and later the
// "Local Network" privacy permission cannot be attached to an unsigned app:
// every TCP connection to the board fails with EHOSTUNREACH even after the
// user turns the switch on in System Settings. An ad-hoc signature (identity
// "-") needs no certificate or account and gives the bundle a stable identity,
// so the permission prompt appears and the switch works. Gatekeeper still
// warns about an unidentified developer: that needs a paid Developer ID.
//
// For the universal target electron-builder calls this hook three times: on
// the x64 and arm64 intermediate bundles (appOutDir "...-x64-temp" and
// "...-arm64-temp") and then on the merged universal bundle, before the .dmg
// is built. Only the last one must be signed: @electron/universal refuses to
// merge two bundles whose signature files differ. Nothing to do on Windows.
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (/-(x64|arm64)-temp$/.test(context.appOutDir)) return;   // intermediate arch of a universal build
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
