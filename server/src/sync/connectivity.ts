import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';

// "Is this machine online at all?" (docs/design.md 10.4, "Connectivity first"): a DNS lookup and a TCP connect to the
// provider host, no HTTP request, so the diary sees nothing. A failure here is the home server's problem and is never
// counted against the diary.

export type OnlineCheck = (baseUrl: string) => Promise<boolean>;

export const checkOnline: OnlineCheck = async (baseUrl, timeoutMs = 5000) => {
  const url = new URL(baseUrl);
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  try {
    const { address } = await lookup(url.hostname);
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: address, port, timeout: timeoutMs });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
      socket.once('error', reject);
    });
    return true;
  } catch {
    return false;
  }
};
