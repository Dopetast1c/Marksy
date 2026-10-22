// The HTTP surface a provider sees (ctx.http). The implementation is throttled-client.ts.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface HttpRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Sent as JSON. */
  body?: unknown;
  /** Marks the login call: never retried, at most one per run. */
  login?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  /** Raw body text; json() parses it. */
  text: string;
  json(): unknown;
}

export interface HttpClient {
  /**
   * One request, queued behind every other request of this run. `path` is relative to manifest.network.baseUrl.
   * Retries 429, 5xx and network errors with backoff (except login), then returns the last response or throws the
   * last network error. Throws ProviderPolicyError for anything outside the allow-list.
   */
  request(method: HttpMethod, path: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  get(path: string, options?: Omit<HttpRequestOptions, 'body'>): Promise<HttpResponse>;
  post(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'body'>): Promise<HttpResponse>;
  /** Requests sent so far in this run, retries included. */
  readonly requestCount: number;
}
