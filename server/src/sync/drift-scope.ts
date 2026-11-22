// A mass-removal hold (design.md 8) is about one account's diary, not about the provider's API, so its
// api_drift_events row is the account's own: another family whose diary uses the same provider never sees it.

const PREFIX = 'collector:';

/** The api_drift_events endpoint of one account's holds */
export const massRemovalEndpoint = (accountId: string) => `${PREFIX}${accountId}`;

/** Whether a drift row may be shown for this account: every API change, and the account's own holds */
export const driftVisibleTo = (endpoint: string, accountId: string) =>
  !endpoint.startsWith(PREFIX) || endpoint === massRemovalEndpoint(accountId);

/** What a family sees as the endpoint of a row: a hold says "collector", never an id */
export const shownEndpoint = (endpoint: string) => (endpoint.startsWith(PREFIX) ? 'collector' : endpoint);
