import type { VulnerabilityIntelligence } from './types.js';

export function vulnerability(
  id = 'CVE-2026-12345',
  o: { knownExploited?: boolean | null; score?: number | null; severity?: string | null } = {},
): VulnerabilityIntelligence {
  const knownExploited = o.knownExploited === undefined ? true : o.knownExploited;
  const score = o.score === undefined ? 9.8 : o.score;
  const severity = o.severity === undefined ? 'CRITICAL' : o.severity;
  return {
    id,
    knownExploited,
    kev: knownExploited
      ? {
          vendorProject: 'Example Vendor',
          product: 'Example Product',
          vulnerabilityName: 'Example Product Code Execution Vulnerability',
          dateAdded: '2026-08-01',
          shortDescription: 'An example vulnerability.',
          requiredAction: 'Apply mitigations per vendor instructions.',
          dueDate: '2026-08-22',
          knownRansomwareCampaignUse: 'Known',
          notes: null,
          cwes: ['CWE-78'],
        }
      : null,
    nvd: {
      description: 'An example NVD description.',
      cvss:
        score === null && severity === null
          ? null
          : {
              version: '3.1',
              score,
              severity,
              vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
              source: 'nvd@nist.gov',
              type: 'Primary',
            },
      cwes: ['CWE-78'],
      published: '2026-07-31T00:00:00.000Z',
      lastModified: '2026-08-01T00:00:00.000Z',
      vulnStatus: 'Analyzed',
      references: [],
      affectedConfigurations: [],
    },
    provenance: {
      news: [{ sourceId: 'krebs', url: 'https://example.test/story', field: 'title' }],
      cisaKev: {
        status: knownExploited === null ? 'unavailable' : knownExploited ? 'found' : 'not_found',
        catalogUrl: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        dataUrl: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
        catalogVersion: knownExploited === null ? null : '2026.08.01',
        dateReleased: knownExploited === null ? null : '2026-08-01T00:00:00.000Z',
        retrievedAt: knownExploited === null ? null : '2026-08-01T01:00:00.000Z',
      },
      nvd: {
        status: 'found',
        apiUrl: `https://services.nvd.nist.gov/rest/json/cves/2.0?cveIds=${id}`,
        recordUrl: `https://nvd.nist.gov/vuln/detail/${id}`,
        retrievedAt: '2026-08-01T01:00:00.000Z',
      },
    },
  };
}
