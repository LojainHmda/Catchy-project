/** Full-page navigation to another site (e.g. back to claude.ai / ChatGPT after OAuth consent). */
export function navigateToExternal(url: string): void {
  window.location.assign(url);
}
