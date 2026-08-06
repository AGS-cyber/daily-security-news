import type { Source } from '../types.js';

export const sources: Source[] = [
  { id: 'krebs', kind: 'rss', name: 'Krebs on Security', feedUrl: 'https://krebsonsecurity.com/feed/' },
  { id: 'bleepingcomputer', kind: 'rss', name: 'BleepingComputer', feedUrl: 'https://www.bleepingcomputer.com/feed/' },
  { id: 'thehackernews', kind: 'rss', name: 'The Hacker News', feedUrl: 'https://feeds.feedburner.com/TheHackersNews' },
  { id: 'therecord', kind: 'rss', name: 'The Record', feedUrl: 'https://therecord.media/feed' },
  { id: 'securityweek', kind: 'rss', name: 'SecurityWeek', feedUrl: 'https://www.securityweek.com/feed/' },
  { id: 'darkreading', kind: 'rss', name: 'Dark Reading', feedUrl: 'https://www.darkreading.com/rss.xml' },
  { id: 'cisa-advisories', kind: 'rss', name: 'CISA Advisories', feedUrl: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
  { id: 'projectzero', kind: 'rss', name: 'Google Project Zero', feedUrl: 'https://googleprojectzero.blogspot.com/feeds/posts/default' },
  { id: 'securelist', kind: 'rss', name: 'Securelist', feedUrl: 'https://securelist.com/feed/' },
  { id: 'talos', kind: 'rss', name: 'Cisco Talos', feedUrl: 'https://blog.talosintelligence.com/rss/' },
  { id: 'unit42', kind: 'rss', name: 'Unit 42', feedUrl: 'https://unit42.paloaltonetworks.com/feed/' },
  { id: 'microsoft-security', kind: 'rss', name: 'Microsoft Security', feedUrl: 'https://www.microsoft.com/en-us/security/blog/feed/' },
];
