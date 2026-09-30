export function httpUrl(raw: string): string {
 const u = new URL(raw);
 if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only credential-free HTTP(S) URLs are allowed');
 return u.href;
}
