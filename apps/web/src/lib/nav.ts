/** Maps detail routes to their index section (/term/* → /terms, /acronym/* → /acronyms). */
export function isCurrentNavPath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/terms' && pathname.startsWith('/term/')) return true;
  if (href === '/acronyms' && pathname.startsWith('/acronym/')) return true;
  return pathname.startsWith(`${href}/`);
}
