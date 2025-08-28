import { describe, it, expect, vi } from 'vitest';
import { handler, ImageFormat, ImageType } from './index';
import type { CloudFrontResponseEvent, Callback, Context } from 'aws-lambda';
import fs from 'fs';
import path from 'path';

type TestParams = {
  width?: number;
  height?: number;
  format?: ImageFormat;
  fit?: ImageType;
  quality?: number;
};

const TEST_IMAGE_PATH = path.resolve(__dirname, 'pepe.jpg');
const TEST_IMAGE_BUFFER = new Uint8Array(fs.readFileSync(TEST_IMAGE_PATH));
const TEST_EVENT: CloudFrontResponseEvent = {
  Records: [
    {
      cf: {
        config: {
          distributionDomainName: 'imsi domain',
          distributionId: 'EXAMPLE',
          eventType: 'origin-response',
          requestId: 'requestId',
        },
        request: {
          uri: '/pepe.jpg',
          method: 'GET',
          clientIp: '2001:cdba::3257:9652',
          querystring: 'imsi',
          headers: { host: [{ key: 'Host', value: 'd123.cf.net' }] },
        },
        response: {
          status: '204',
          statusDescription: 'Original Response',
          headers: {},
        },
      },
    },
  ],
};

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual('@aws-sdk/client-s3');

  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        Body: {
          transformToByteArray: () => TEST_IMAGE_BUFFER,
        },
      }),
    })),
  };
});

describe('Lambda@Edge image resize function test', () => {
  it('should return resized image', async () => {
    const params: TestParams = {
      width: 300,
      height: 300,
      format: 'avif',
      fit: 'cover',
      quality: 100,
    };

    const callback: Callback = (err, res) => {
      expect(err).toBeNull();
      expect(res.status).toBe('200');
      expect(res.statusDescription).toBe('OK');
      expect(res.body).toBeTruthy();
      expect(res.bodyEncoding).toBe('base64');
      expect(res.headers['content-type'][0].value).toBe(`image/${params.format}`);
    };

    await handler(generateEvent(params), {} as Context, callback);
  });

  it('should pass both width and height: returns origin response', async () => {
    const params: TestParams = {
      height: 300,
    };

    const callback: Callback = (err, res) => {
      expect(err).toBeNull();
      expect(res.status).toBe('204');
      expect(res.statusDescription).toBe('Original Response');
      expect(res.body).toBeUndefined();
      expect(res.bodyEncoding).toBeUndefined();
    };

    await handler(generateEvent(params), {} as Context, callback);
  });
});

const generateEvent = (params: TestParams) => {
  const event = structuredClone(TEST_EVENT);
  const querystring = Object.entries(params).reduce((acc, [key, value]) => `${acc}&${key}=${value}`, '?');

  event.Records[0].cf.request.querystring = querystring;

  return event;
};
