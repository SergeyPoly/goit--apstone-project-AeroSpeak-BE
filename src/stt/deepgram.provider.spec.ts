import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { DeepgramSttProvider } from './deepgram.provider';

const config = {
  get: (key: string) => ({ DEEPGRAM_MODEL: 'nova-3', DEEPGRAM_API_KEY: 'test-key' })[key],
} as unknown as ConfigService<Env, true>;

describe('DeepgramSttProvider', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchMock.mockReset();
  });

  it('opts every request out of Deepgram model improvement, so pilot audio is not kept', async () => {
    const provider = new DeepgramSttProvider(config);

    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      keyterms: [],
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    expect(new URL(requestUrl).searchParams.get('mip_opt_out')).toBe('true');
  });
});
