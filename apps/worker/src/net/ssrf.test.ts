import { describe, expect, it } from 'vitest';

import { isAllowedHostname, isForbiddenHostname, isForbiddenIp } from './ssrf.js';

describe('ssrf helpers', () => {
  it('blocks private + local IPv4 ranges', () => {
    expect(isForbiddenIp('127.0.0.1')).toBe(true);
    expect(isForbiddenIp('10.0.0.1')).toBe(true);
    expect(isForbiddenIp('172.16.0.1')).toBe(true);
    expect(isForbiddenIp('192.168.1.1')).toBe(true);
    expect(isForbiddenIp('169.254.169.254')).toBe(true);
    expect(isForbiddenIp('0.0.0.0')).toBe(true);
    expect(isForbiddenIp('8.8.8.8')).toBe(false);
  });

  it('blocks local IPv6 ranges', () => {
    expect(isForbiddenIp('::1')).toBe(true);
    expect(isForbiddenIp('fe80::1')).toBe(true);
    expect(isForbiddenIp('fc00::1')).toBe(true);
    expect(isForbiddenIp('fd00::1')).toBe(true);
    expect(isForbiddenIp('2001:4860:4860::8888')).toBe(false);
  });

  it('blocks internal hostnames', () => {
    expect(isForbiddenHostname('localhost')).toBe(true);
    expect(isForbiddenHostname('example')).toBe(true);
    expect(isForbiddenHostname('service.local')).toBe(true);
    expect(isForbiddenHostname('csrc.nist.gov')).toBe(false);
  });

  it('allows exact + subdomains', () => {
    expect(isAllowedHostname('csrc.nist.gov', ['csrc.nist.gov'])).toBe(true);
    expect(isAllowedHostname('sub.csrc.nist.gov', ['csrc.nist.gov'])).toBe(true);
    expect(isAllowedHostname('evilnist.gov', ['csrc.nist.gov'])).toBe(false);
  });
});

