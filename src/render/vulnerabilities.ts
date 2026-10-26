import type { VulnerabilityIntelligence, VulnerabilityPriority } from '../types.js';
import { vulnerabilityPriority } from '../vulnerability/priority.js';

export interface VulnerabilityDisplay {
  id: string;
  href: string | null;
  labels: string[];
  evidence: { name: string; href: string; status: string; retrievedAt: string | null }[];
  action: { text: string; dueDate: string } | null;
  /** This CVE's own priority, from the same rule the story priority uses. */
  priority: VulnerabilityPriority;
  /** NVD CVSS base score exactly as supplied, for ordering only. */
  score: number | null;
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
    labels.push(`CVSS ${score(metric.score)} (${metric.version})`);
  }
  if (metric?.severity) labels.push(titleCase(metric.severity));
  if (cve.knownExploited === true) labels.push('CISA KEV');
  if (cve.knownExploited === null) labels.push('KEV status unavailable');
  if (cve.provenance.nvd.status === 'unavailable') labels.push('NVD unavailable');
  if (cve.provenance.nvd.status === 'not_found') labels.push('NVD record not found');
  if (cve.kev?.knownRansomwareCampaignUse?.toLowerCase() === 'known') {
    labels.push('CISA ransomware use: Known');
  }

  const href =
    cve.provenance.nvd.status === 'found'
      ? cve.provenance.nvd.recordUrl
      : cve.knownExploited
        ? cve.provenance.cisaKev.catalogUrl
        : null;
  return {
    id: cve.id, href, labels,
    evidence: [
      { name: 'CISA KEV', href: cve.provenance.cisaKev.catalogUrl,
        status: cve.provenance.cisaKev.status, retrievedAt: cve.provenance.cisaKev.retrievedAt },
      { name: 'NVD', href: cve.provenance.nvd.recordUrl,
        status: cve.provenance.nvd.status, retrievedAt: cve.provenance.nvd.retrievedAt },
    ],
    action: cve.knownExploited === true && cve.kev?.requiredAction
      ? { text: cve.kev.requiredAction, dueDate: cve.kev.dueDate } : null,
    priority: vulnerabilityPriority({ cves: [cve] }),
    score: typeof metric?.score === 'number' && Number.isFinite(metric.score) ? metric.score : null,
  };
}

/** CISA KEV first, then higher supplied CVSS score, then CVE id. */
function compare(a: VulnerabilityDisplay, b: VulnerabilityDisplay): number {
  const kev = Number(b.priority === 'known_exploited') - Number(a.priority === 'known_exploited');
  if (kev) return kev;
  const byScore = (b.score ?? -1) - (a.score ?? -1);
  if (byScore) return byScore;
  return a.id.localeCompare(b.id);
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
    .map(display)
    .sort(compare);
}
