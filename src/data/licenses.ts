/* Attribution for the third-party code that ships inside the app bundle.
 *
 * Both licences here require it: MIT asks that the copyright notice and
 * permission notice travel with every copy, and Apache-2.0 §4(a) says
 * recipients must be given the licence itself, so the full texts are bundled
 * rather than linked. Apache-2.0 §4(d) additionally requires passing along
 * any NOTICE file the work carries — Dexie ships one, so it is reproduced.
 *
 * The list is the *runtime* dependency graph, not package.json's dependency
 * block: scheduler is nobody's direct dependency but React pulls it in and it
 * genuinely lands in dist, so it is credited. devDependencies are absent
 * because they never reach a user's device.
 *
 * Everything below was read out of node_modules rather than recalled — the
 * versions and copyright holders should be re-checked whenever a dependency
 * is upgraded. */

import apache2Text from './licenses/Apache-2.0.txt?raw';
import dexieNotice from './licenses/dexie-NOTICE.txt?raw';
import mitBody from './licenses/MIT.txt?raw';

export type LicenseId = 'MIT' | 'Apache-2.0';

export interface OpenSourcePackage {
  name: string;
  version: string;
  license: LicenseId;
  /** Verbatim from the package's own LICENSE file. */
  copyright: string;
  homepage: string;
}

export const OPEN_SOURCE_PACKAGES: readonly OpenSourcePackage[] = [
  {
    name: 'React',
    version: '19.2.8',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://github.com/facebook/react',
  },
  {
    name: 'React DOM',
    version: '19.2.8',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://github.com/facebook/react',
  },
  {
    name: 'Scheduler',
    version: '0.27.0',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://github.com/facebook/react',
  },
  {
    name: 'Dexie.js',
    version: '4.4.4',
    license: 'Apache-2.0',
    copyright: 'Copyright (c) 2014-2017 David Fahlander',
    homepage: 'https://github.com/dexie/Dexie.js',
  },
  {
    name: 'dexie-react-hooks',
    version: '4.4.0',
    license: 'Apache-2.0',
    copyright: 'Copyright (c) David Fahlander',
    homepage: 'https://github.com/dexie/Dexie.js',
  },
  {
    name: 'Zod',
    version: '4.4.3',
    license: 'MIT',
    copyright: 'Copyright (c) 2025 Colin McDonnell',
    homepage: 'https://github.com/colinhacks/zod',
  },
];

/** MIT's body is identical everywhere; only the copyright line above it
 *  differs, so it's stored once and recombined per package. */
export function licenseText(pkg: OpenSourcePackage): string {
  if (pkg.license === 'MIT') return `${pkg.copyright}\n\n${mitBody.trim()}`;
  return apache2Text.trim();
}

/** Reproduced under Apache-2.0 §4(d), which requires a NOTICE file to travel
 *  with redistributions of the work. */
export const DEXIE_NOTICE = dexieNotice.trim();
