/**
 * Removes the query string before a URL reaches a log. Query strings can carry
 * verification, reset, or signed-URL credentials.
 */
export function pathOnly(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
