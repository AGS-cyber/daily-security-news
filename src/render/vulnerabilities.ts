import type { VulnerabilityIntelligence } from '../types.js';

export interface VulnerabilityDisplay {
  id: string;
  href: string | null;
  labels: string[];
}

function score(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

function important(cve: VulnerabilityIntelligence): boolean {
  const metric = cve.nvd?.cvss;
  return (
    cve.knownExploited === true
    || metric?.severity === 'CRITICAL'
    || metric?.severity === 'HIGH'
    || (metric?.score ?? -1) >= 7
  );
}

function display(cve: VulnerabilityIntelligence): VulnerabilityDisplay {
  const labels: string[] = [];
  const metric = cve.nvd?.cvss;
  if (metric?.score !== null && metric?.score !== undefined) {
    labels.push(`CVSS ${score(metric.score)}`);
  }
  if (metric?.severity) labels.push(titleCase(metric.severity));
  if (cve.knownExploited === true) labels.push('CISA KEV');
  if (cve.kev?.knownRansomwareCampaignUse?.toLowerCase() === 'known') {
    labels.push('CISA ransomware use: Known');
  }

  const href =
    cve.provenance.nvd.status === 'found'
      ? cve.provenance.nvd.recordUrl
      : cve.knownExploited
        ? cve.provenance.cisaKev.catalogUrl
        : null;
  return { id: cve.id, href, labels };
}

/** Deduplicated compact rows for presentation; full source records stay in JSON. */
export function vulnerabilityDisplays(
  stories: { cves?: VulnerabilityIntelligence[] }[],
  importantOnly = true,
): VulnerabilityDisplay[] {
  const byId = new Map<string, VulnerabilityIntelligence>();
  for (const story of stories) {
    for (const cve of story.cves ?? []) {
      const current = byId.get(cve.id);
      if (!current || (!current.nvd && cve.nvd) || (!current.kev && cve.kev)) byId.set(cve.id, cve);
    }
  }
  return [...byId.values()]
    .filter((cve) => !importantOnly || important(cve))
    .sort((a, b) => Number(b.knownExploited) - Number(a.knownExploited) || a.id.localeCompare(b.id))
    .map(display);
}
