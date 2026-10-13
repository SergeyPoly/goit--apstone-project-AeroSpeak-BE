import { buildCorsOrigin } from './cors';

function check(origins: string | undefined, regex: string | undefined, origin?: string): boolean {
  let result: boolean | undefined;
  buildCorsOrigin(origins, regex)(origin, (_error, allow) => {
    result = allow;
  });
  return result as boolean;
}

describe('buildCorsOrigin', () => {
  it('allows requests without an Origin header', () => {
    expect(check('http://localhost:5173', '', undefined)).toBe(true);
  });

  it('allows listed origins and trims spaces', () => {
    const origins = 'http://localhost:5173, https://aerospeak.vercel.app';
    expect(check(origins, '', 'https://aerospeak.vercel.app')).toBe(true);
  });

  it('rejects an origin that is only a substring of a listed one', () => {
    expect(check('http://localhost:5173', '', 'http://localhost:517')).toBe(false);
  });

  it('treats an empty regex as "no regex"', () => {
    expect(check('http://localhost:5173', '', 'https://evil.example')).toBe(false);
    expect(check('http://localhost:5173', undefined, 'https://evil.example')).toBe(false);
  });

  it('allows preview deployments that match the regex', () => {
    const regex = '^https://aerospeak-[a-z0-9-]+\\.vercel\\.app$';
    expect(check('', regex, 'https://aerospeak-git-feat-x.vercel.app')).toBe(true);
    expect(check('', regex, 'https://aerospeak-git-feat-x.vercel.app.evil.com')).toBe(false);
  });
});
