#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [certificatePath] = process.argv.slice(2);
const password = process.env.P12_PASSWORD;

if (!certificatePath || process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: P12_PASSWORD=<password> node scripts/validate-developer-id-certificate.mjs <certificate.p12>');
  process.exit(certificatePath ? 0 : 1);
}

if (!password) {
  console.error('P12_PASSWORD is required.');
  process.exit(1);
}

if (!existsSync(certificatePath)) {
  console.error(`Certificate file not found: ${certificatePath}`);
  process.exit(1);
}

const cert = spawnSync(
  'openssl',
  ['pkcs12', '-in', certificatePath, '-nokeys', '-clcerts', '-passin', `pass:${password}`],
  { encoding: 'buffer' }
);

if (cert.status !== 0) {
  console.error('Could not read the .p12 file. Check the path and export password.');
  process.exit(cert.status ?? 1);
}

const subject = spawnSync('openssl', ['x509', '-noout', '-subject'], {
  input: cert.stdout,
  encoding: 'utf8'
});

if (subject.status !== 0) {
  console.error('Could not inspect the certificate subject.');
  process.exit(subject.status ?? 1);
}

const subjectText = subject.stdout.trim();
console.log(subjectText);

if (!subjectText.includes('Developer ID Application')) {
  console.error('This certificate is not a Developer ID Application certificate.');
  process.exit(1);
}

console.log('Developer ID Application certificate confirmed.');
