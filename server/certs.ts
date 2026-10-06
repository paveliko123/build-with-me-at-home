// The home certificate: a small certificate authority made once on this computer, limited
// (name constraints) to private home-network addresses and *.local names, so it can never
// vouch for a real website. Its key never leaves the computer. A short-lived server
// certificate for the laptop's current home address(es) is issued from it on every start.
// Tablets install the authority once (setup-tablet page); then https://<laptop>:4748 is
// "secure" and the microphone is allowed.
// It lives in the family folder (<home>\Build With Me\.home-certificate), not the plugin
// folder: plugin data is deleted on uninstall, and a new authority would silently break
// every tablet that trusts the old one (found in the learner's slice 3 test).

import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { webcrypto } from 'node:crypto';
import { networkInterfaces, hostname, tmpdir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { AsnConvert } from '@peculiar/asn1-schema';
import { NameConstraints, GeneralSubtree, GeneralSubtrees, GeneralName, id_ce_nameConstraints } from '@peculiar/asn1-x509';
import { pluginDataDir, familyDataDir } from './paths.js';

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const PRIVATE_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'];
const DAY = 24 * 60 * 60 * 1000;

function certsDir(): string {
  const dir = join(familyDataDir(), '.home-certificate');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'home-ca.crt'))) adoptExistingAuthority(dir);
  return dir;
}

/** One authority per family: reuse the oldest one this computer already made (earlier
 *  versions kept it in the plugin folder, or the development folder), since that is the
 *  one tablets are most likely to trust already. */
function adoptExistingAuthority(dir: string): void {
  const places = [join(pluginDataDir(), 'certs')];
  if (!process.env.BWM_DATA) places.push(join(tmpdir(), 'build-with-me-dev', 'certs'));
  const found = places
    .filter((p) => existsSync(join(p, 'home-ca.crt')) && existsSync(join(p, 'home-ca.key')))
    .map((p) => ({ p, from: new x509.X509Certificate(readFileSync(join(p, 'home-ca.crt'), 'utf8')).notBefore.getTime() }))
    .sort((a, b) => a.from - b.from);
  if (!found[0]) return;
  copyFileSync(join(found[0].p, 'home-ca.key'), join(dir, 'home-ca.key'));
  copyFileSync(join(found[0].p, 'home-ca.crt'), join(dir, 'home-ca.crt'));
}

/** The name a tablet shows for the authority, e.g. "Build With Me Home (LAPTOP) 6 Oct 2026". */
export function authorityName(ca: Authority): string {
  return new x509.X509Certificate(ca.certPem).subjectName.getField('CN')[0] ?? 'Build With Me Home';
}

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = Buffer.from(der).toString('base64').replace(/.{64}/g, '$&\n');
  return `-----BEGIN ${label}-----\n${b64}${b64.endsWith('\n') ? '' : '\n'}-----END ${label}-----\n`;
}

function fromPem(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function nameConstraintsExtension(): x509.Extension {
  const permitted = new GeneralSubtrees([
    ...PRIVATE_RANGES.map((cidr) => new GeneralSubtree({ base: new GeneralName({ iPAddress: cidr }) })),
    new GeneralSubtree({ base: new GeneralName({ dNSName: 'local' }) }),
    new GeneralSubtree({ base: new GeneralName({ dNSName: 'localhost' }) }),
  ]);
  const value = AsnConvert.serialize(new NameConstraints({ permittedSubtrees: permitted }));
  return new x509.Extension(id_ce_nameConstraints, true, value);
}

/** Home IPv4 addresses (private ranges only), e.g. ["192.168.1.23"]. */
export function homeAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) out.push(ni.address);
    }
  }
  return [...new Set(out)];
}

export interface Authority { certPem: string; certDer: ArrayBuffer; keys: CryptoKeyPair; fingerprint: string }

export async function loadOrCreateAuthority(): Promise<Authority> {
  const dir = certsDir();
  const certFile = join(dir, 'home-ca.crt');
  const keyFile = join(dir, 'home-ca.key');
  if (existsSync(certFile) && existsSync(keyFile)) {
    const certPem = readFileSync(certFile, 'utf8');
    const cert = new x509.X509Certificate(certPem);
    const privateKey = await webcrypto.subtle.importKey('pkcs8', fromPem(readFileSync(keyFile, 'utf8')), ALG, true, ['sign']);
    const publicKey = await cert.publicKey.export(ALG, ['verify']);
    return { certPem, certDer: cert.rawData, keys: { privateKey, publicKey } as CryptoKeyPair, fingerprint: Buffer.from(await cert.getThumbprint('SHA-256')).toString('hex') };
  }
  const keys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const now = new Date();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex').replace(/^[89a-f]/, '1'),
    // The date tells this authority apart from any older one on a tablet.
    name: `CN=Build With Me Home (${hostname()}) ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, O=Build With Me at Home`,
    notBefore: new Date(now.getTime() - DAY),
    notAfter: new Date(now.getTime() + 10 * 365 * DAY),
    signingAlgorithm: ALG,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      nameConstraintsExtension(),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  const keyPem = toPem(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey), 'PRIVATE KEY');
  writeFileSync(keyFile, keyPem, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(certFile, cert.toString('pem'), 'utf8');
  return { certPem: cert.toString('pem'), certDer: cert.rawData, keys, fingerprint: Buffer.from(await cert.getThumbprint('SHA-256')).toString('hex') };
}

export interface ServerCert { certPem: string; keyPem: string; addresses: string[] }

/** Issues a 30-day server certificate for the current home addresses (and localhost). */
export async function issueServerCert(ca: Authority, addresses = homeAddresses()): Promise<ServerCert> {
  const keys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const caCert = new x509.X509Certificate(ca.certPem);
  const now = new Date();
  const host = hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex').replace(/^[89a-f]/, '1'),
    subject: `CN=${addresses[0] ?? 'localhost'}`,
    issuer: caCert.subject,
    notBefore: new Date(now.getTime() - DAY),
    notAfter: new Date(now.getTime() + 30 * DAY),
    signingAlgorithm: ALG,
    publicKey: keys.publicKey,
    signingKey: ca.keys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth], false),
      new x509.SubjectAlternativeNameExtension([
        ...addresses.map((ip) => ({ type: 'ip' as const, value: ip })),
        { type: 'ip' as const, value: '127.0.0.1' },
        { type: 'dns' as const, value: 'localhost' },
        { type: 'dns' as const, value: `${host}.local` },
      ]),
      await x509.AuthorityKeyIdentifierExtension.create(caCert, false),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  const keyPem = toPem(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey), 'PRIVATE KEY');
  // Full chain so clients that only trust the authority can build the path.
  return { certPem: cert.toString('pem') + '\n' + ca.certPem, keyPem, addresses };
}

/** iPad/iPhone configuration profile that installs the home authority (user still enables full trust). */
export function mobileConfig(ca: Authority): string {
  const b64 = Buffer.from(ca.certDer).toString('base64');
  const id = ca.fingerprint.slice(0, 8);
  const uuid1 = `B1D1E0A1-0000-4000-8000-${ca.fingerprint.slice(0, 12).toUpperCase()}`;
  const uuid2 = `B1D1E0A2-0000-4000-8000-${ca.fingerprint.slice(12, 24).toUpperCase()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadContent</key><array><dict>
    <key>PayloadCertificateFileName</key><string>build-with-me-home.cer</string>
    <key>PayloadContent</key><data>${b64}</data>
    <key>PayloadDisplayName</key><string>Build With Me home certificate</string>
    <key>PayloadIdentifier</key><string>home.buildwithme.ca.${id}</string>
    <key>PayloadType</key><string>com.apple.security.root</string>
    <key>PayloadUUID</key><string>${uuid2}</string>
    <key>PayloadVersion</key><integer>1</integer>
  </dict></array>
  <key>PayloadDescription</key><string>Lets this tablet talk to Build With Me on your home computer. It only works for home-network addresses.</string>
  <key>PayloadDisplayName</key><string>Build With Me (home)</string>
  <key>PayloadIdentifier</key><string>home.buildwithme.${id}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid1}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict></plist>
`;
}
