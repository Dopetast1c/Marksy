// Typed provider failures (docs/providers.md section 3). A provider maps its system's statuses and error bodies to one
// of these; the planner (docs/design.md 10.4) maps them to failure classes. A network error is left to propagate.

export class ProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Wrong credentials. With limits.authFailureIsFinal the account stops until the credentials change. */
export class ProviderAuthError extends ProviderError {}

/** The system refuses this account or this network (blocked, captcha, region). */
export class ProviderBlockedError extends ProviderError {}

/** Login needs a one-time code; the prompt is shown to the user. */
export class ProviderNeeds2FAError extends ProviderError {
  constructor(
    message: string,
    readonly prompt?: string,
  ) {
    super(message);
  }
}

/** 5xx, 429, timeout: the system is there but not answering properly. */
export class ProviderUnavailableError extends ProviderError {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** A response that cannot be used at all (a required top-level field is missing); recorded as drift first. */
export class ProviderSchemaError extends ProviderError {}

/** A request outside the manifest's readOnlyAllowList, a second login in one run, or a foreign host. Always a bug. */
export class ProviderPolicyError extends ProviderError {}
