// Packages the production build for aerocat.tech: release/aerosim-<version>.tar.gz
// (single top-level folder "aerosim") plus a .sha256 file. Usage: npm run package [-- <version>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = (process.argv[2] ?? pkg.version).replace(/^v/, '');
if (version !== pkg.version) {
  console.error(`Version ${version} does not match package.json ${pkg.version}`);
  process.exit(1);
}

execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
rmSync('release', { recursive: true, force: true });
mkdirSync('release/aerosim', { recursive: true });
cpSync('dist', 'release/aerosim', { recursive: true });
writeFileSync('release/aerosim/version.txt', `${version}\n`);

const file = `aerosim-${version}.tar.gz`;
execFileSync('tar', ['--sort=name', '--owner=0', '--group=0', '--numeric-owner', '-czf', file, 'aerosim'], { cwd: 'release', stdio: 'inherit' });
const sha = createHash('sha256').update(readFileSync(`release/${file}`)).digest('hex');
writeFileSync(`release/${file}.sha256`, `${sha}  ${file}\n`);
console.log(`release/${file}\n${sha}`);
