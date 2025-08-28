import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Callback, CloudFrontResponseEvent, Context } from 'aws-lambda';
import sharp from 'sharp';

declare module 'aws-lambda' {
  interface CloudFrontResponse {
    body?: string;
    bodyEncoding?: 'base64';
  }
}

export type Params = {
  width: number;
  height: number;
  quality: number;
  type: ImageType;
  format: ImageFormat;
};
export type ImageType = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
export type ImageFormat = keyof sharp.FormatEnum;

const s3 = new S3Client({ region: 'ap-northeast-2' });
const BUCKET = 'resource-hyub';

export const handler = async (event: CloudFrontResponseEvent, _context: Context, callback: Callback) => {
  const { request, response } = event.Records[0].cf;
  const searchParams = new URLSearchParams(request.querystring);
  const uri = decodeURIComponent(request.uri);
  const [, imageName, parsedFormat] = uri.match(/^\/?(.*)\.(.*)$/)!;
  const { width, height, quality, type, format }: Params = {
    width: Number(searchParams.get('width')),
    height: Number(searchParams.get('height')),
    quality: Number(searchParams.get('quality')) || 75,
    type: (searchParams.get('type') || 'contain') as ImageType,
    format: (searchParams.get('format') || 'webp') as ImageFormat,
  };

  try {
    const image = await getS3Object(`${imageName}.${parsedFormat}`);

    if (!image.Body || !response || !width || !height) {
      console.error('Image request error', uri);

      return callback(null, response);
    }

    const imageBuffer = await image.Body.transformToByteArray();
    const resizedImage = await resizeImage({ buffer: imageBuffer, width, height, format, fit: type, quality });

    response.status = '200';
    response.statusDescription = 'OK';
    response.body = resizedImage.toString('base64');
    response.bodyEncoding = 'base64';
    response.headers['content-type'] = [{ key: 'Content-Type', value: `image/${format}` }];
    response.headers['cache-control'] = [{ key: 'Cache-Control', value: 'max-age=31536000' }];

    return callback(null, response);
  } catch (error) {
    console.error('Image processing error:', error);

    response.status = '500';
    response.statusDescription = 'Internal Server Error';
    response.body = 'Error processing image';

    return callback(null, response);
  }
};

const getS3Object = async (key: string) => {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const s3Object = await s3.send(command);

    if (!s3Object.Body) {
      throw new Error('S3 object has no Body');
    }

    return s3Object;
  } catch (error) {
    console.error('Get S3 object error:', error);

    throw error;
  }
};

const resizeImage = async ({
  buffer,
  width,
  height,
  format,
  fit,
  quality,
}: {
  buffer: Uint8Array;
  width: number;
  height: number;
  format: ImageFormat;
  fit: ImageType;
  quality: number;
}) => {
  try {
    const image = sharp(buffer).resize(width, height, { fit });
    const formatted = await image.toFormat(format, { quality }).toBuffer();

    return formatted;
  } catch (error) {
    console.error('Sharp resize error:', error);

    throw error;
  }
};
