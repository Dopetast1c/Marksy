import { describe, expect, it } from 'vitest';
import { getProvider, listProviders } from './index';

describe('registry', () => {
  it('knows demo-minimal but does not offer it to families', () => {
    expect(getProvider('demo-minimal')?.manifest.capabilities.lessons).toBe(false);
    expect(listProviders().map((p) => p.manifest.id)).not.toContain('demo-minimal');
    expect(listProviders({ all: true }).map((p) => p.manifest.id)).toContain('demo-minimal');
  });

  it('never lists the template', () => {
    expect(getProvider('_template')).toBeUndefined();
  });
});
