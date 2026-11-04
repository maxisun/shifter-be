import { verifyContract } from './contract-verify.mjs';

const url =
  'https://github.com/maxisun/shifters-specs/releases/download/api-v1.0.0/shiftpatch-api-1.0.0.tgz';

function validInput() {
  return {
    packageJson: {
      devDependencies: {
        '@maxisun/shiftpatch-api': url,
      },
    },
    installedPackageJson: {
      name: '@maxisun/shiftpatch-api',
      version: '1.0.0',
    },
    manifest: {
      contractVersion: '1.0.0',
      oasVersion: '3.1.0',
      sourceCommit: '10135556394a5920f0ef0ebd40b9b25d19ee9e0e',
      workItems: [{ id: 'shiftpatch-mvp/02', revision: 1 }],
    },
    openapi: 'openapi: 3.1.0\ninfo:\n  title: ShiftPatch\n  version: 1.0.0\n',
    lockfile: `  '@maxisun/shiftpatch-api@${url}':\n    resolution: {integrity: sha512-abc123, tarball: ${url}}\n`,
  };
}

describe('contract verifier', () => {
  it('accepts the published 1.0.0 pin', () => {
    expect(verifyContract(validInput())).toEqual([]);
  });

  it('rejects a branch or range instead of a release asset', () => {
    const input = validInput();
    input.packageJson.devDependencies['@maxisun/shiftpatch-api'] =
      'github:maxisun/shifters-specs#main';
    expect(verifyContract(input)).toEqual([
      expect.stringContaining('not an exact shifters-specs release URL'),
    ]);
  });

  it.each([
    [
      'contractVersion',
      { contractVersion: '0.9.0' },
      /does not match URL version/,
    ],
    ['oasVersion', { oasVersion: '3.0.3' }, /does not match document dialect/],
    ['sourceCommit', { sourceCommit: 'deadbeef' }, /not a full lowercase SHA/],
    ['workItems', { workItems: [] }, /workItems is empty/],
    [
      'work item revision',
      { workItems: [{ id: 'x' }] },
      /without id\/revision/,
    ],
  ])('rejects a corrupted manifest %s', (_name, change, expected) => {
    const input = validInput();
    input.manifest = { ...input.manifest, ...change };
    expect(verifyContract(input)).toEqual([expect.stringMatching(expected)]);
  });

  it('rejects an installed package whose version disagrees with the URL', () => {
    const input = validInput();
    input.installedPackageJson.version = '1.0.1';
    expect(verifyContract(input)).toEqual([
      expect.stringContaining('does not match URL version'),
    ]);
  });

  it('rejects a lockfile without an integrity digest', () => {
    const input = validInput();
    input.lockfile = `  '@maxisun/shiftpatch-api@${url}':\n    resolution: {tarball: ${url}}\n`;
    expect(verifyContract(input)).toEqual([
      'pnpm-lock.yaml has no integrity for the contract package',
    ]);
  });

  it('rejects an openapi document whose version drifted', () => {
    const input = validInput();
    input.openapi =
      'openapi: 3.1.0\ninfo:\n  title: ShiftPatch\n  version: 1.0.1\n';
    expect(verifyContract(input)).toEqual([
      expect.stringContaining('does not match URL version'),
    ]);
  });
});
