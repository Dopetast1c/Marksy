import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // the script tests run in node, without a DOM
  if (typeof document === 'undefined') return;
  cleanup();
  localStorage.clear();
});
