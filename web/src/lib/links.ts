// Links to the project's public page (the root package.json's repository): its docs, and the form to correct a
// translation (.github/ISSUE_TEMPLATE/translation.yml, docs/i18n.md 6). Pull requests are not accepted; issues are.

/** Where a stranger reads how to add their own diary system */
export const PROVIDERS_DOC = `${__MARKSY_REPO__}/blob/main/docs/providers.md`;

/** The translation form, with the language filled in */
export function translationIssueUrl(language: string): string {
  return `${__MARKSY_REPO__}/issues/new?${new URLSearchParams({ template: 'translation.yml', language })}`;
}
