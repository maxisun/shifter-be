#!/usr/bin/env node
// Verifies that the installed API contract is the exact release the repository
// claims to consume. Run before generating types; CI runs it on every PR.
//
// The checks are deliberately independent of the generator: a wrong version,
// a branch URL, a missing lockfile digest, or a corrupted manifest must fail
// before any code is produced.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTRACT_PACKAGE = '@maxisun/shiftpatch-api';

const RELEASE_URL =
  /^https:\/\/github\.com\/maxisun\/shifters-specs\/releases\/download\/api-v(\d+\.\d+\.\d+)\/[^/]+\.tgz$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

function readOpenApiVersion(openapi) {
  const lines = openapi.split('\n');
  const dialectLine = lines.find((line) => /^openapi:\s*\S/.test(line));
  const dialect = dialectLine?.replace(/^openapi:\s*/, '').trim();
  let inInfo = false;
  let version;
  for (const line of lines) {
    if (/^info:\s*$/.test(line)) {
      inInfo = true;
      continue;
    }
    if (inInfo && /^\S/.test(line)) break;
    if (inInfo) {
      const match = line.match(/^\s+version:\s*(\S+)/);
      if (match) {
        version = match[1].replace(/^['"]|['"]$/g, '');
        break;
      }
    }
  }
  return { dialect, version };
}

function lockfileHasIntegrity(lockfile, url) {
  const lines = lockfile.split('\n');
  const index = lines.findIndex(
    (line) => line.includes(CONTRACT_PACKAGE) && line.includes(url),
  );
  if (index === -1) return false;
  return (
    lines
      .slice(index, index + 12)
      .join('\n')
      .match(/integrity:\s*sha512-[A-Za-z0-9+/=]+/) !== null
  );
}

/**
 * Pure verifier so the corruption cases can be exercised without rewriting
 * node_modules. Returns an empty array when every check holds.
 */
export function verifyContract({
  packageJson,
  installedPackageJson,
  manifest,
  openapi,
  lockfile,
}) {
  const failures = [];
  const url = packageJson?.devDependencies?.[CONTRACT_PACKAGE];

  if (typeof url !== 'string') {
    failures.push(`${CONTRACT_PACKAGE} is not a devDependency`);
    return failures;
  }

  const urlMatch = url.match(RELEASE_URL);
  if (!urlMatch) {
    failures.push(
      `dependency specifier is not an exact shifters-specs release URL: ${url}`,
    );
    return failures;
  }
  const urlVersion = urlMatch[1];

  if (installedPackageJson?.name !== CONTRACT_PACKAGE) {
    failures.push(`installed package name is not ${CONTRACT_PACKAGE}`);
  }
  if (installedPackageJson?.version !== urlVersion) {
    failures.push(
      `installed package version ${installedPackageJson?.version} does not match URL version ${urlVersion}`,
    );
  }
  if (manifest?.contractVersion !== urlVersion) {
    failures.push(
      `manifest contractVersion ${manifest?.contractVersion} does not match URL version ${urlVersion}`,
    );
  }
  if (!manifest || typeof manifest !== 'object') {
    failures.push('manifest.json is missing or unreadable');
    return failures;
  }

  const { dialect, version } = readOpenApiVersion(openapi ?? '');
  if (version !== urlVersion) {
    failures.push(
      `openapi info.version ${version} does not match URL version ${urlVersion}`,
    );
  }
  if (!dialect) {
    failures.push('bundled openapi.yaml has no openapi dialect');
  }
  if (manifest.oasVersion !== dialect) {
    failures.push(
      `manifest oasVersion ${manifest.oasVersion} does not match document dialect ${dialect}`,
    );
  }
  if (!FULL_SHA.test(manifest.sourceCommit ?? '')) {
    failures.push(
      `manifest sourceCommit is not a full lowercase SHA: ${manifest.sourceCommit}`,
    );
  }
  if (!Array.isArray(manifest.workItems) || manifest.workItems.length === 0) {
    failures.push('manifest workItems is empty');
  } else {
    for (const item of manifest.workItems) {
      if (!item?.id || item.revision === undefined) {
        failures.push(
          'manifest workItems contains an entry without id/revision',
        );
        break;
      }
    }
  }
  if (!lockfileHasIntegrity(lockfile ?? '', url)) {
    failures.push('pnpm-lock.yaml has no integrity for the contract package');
  }

  return failures;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readContractFiles(root = process.cwd()) {
  const packageJson = readJson(path.join(root, 'package.json'));
  const installedRoot =
    process.env.CONTRACT_PACKAGE_DIR ??
    path.join(root, 'node_modules', CONTRACT_PACKAGE);
  return {
    packageJson,
    installedPackageJson: readJson(path.join(installedRoot, 'package.json')),
    manifest: readJson(path.join(installedRoot, 'manifest.json')),
    openapi: readFileSync(path.join(installedRoot, 'openapi.yaml'), 'utf8'),
    lockfile: readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
  };
}

function main() {
  const failures = verifyContract(readContractFiles());
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(
    `Contract pin verified: ${CONTRACT_PACKAGE} from an immutable release asset`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
