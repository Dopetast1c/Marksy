// The consent shown on «Подключить дневник» (docs/design.md 14.1): the text is the key connect.consent in every
// language; its version is recorded with the family (families.consent_version). The English text is the one that
// counts: changing it, or the meaning of a reviewed translation (ru), bumps the version here. A machine translation
// accepts the same version and shows a line under it that opens the English text (docs/i18n.md 1).

export const CONSENT_VERSION = '2026-10-24.3';
