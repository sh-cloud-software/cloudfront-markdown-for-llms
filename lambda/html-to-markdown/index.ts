import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import TurndownService from 'turndown';
import type { S3Event } from 'aws-lambda';

const s3Client = new S3Client({});
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    if (key.endsWith('.md')) {
      console.log(`Object s3://${bucket}/${key} is already a Markdown file, skipping it`);
      continue;
    }

    console.log(`Processing: s3://${bucket}/${key}`);

    const getResponse = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    const htmlContent = await getResponse.Body!.transformToString('utf-8');
    const markdown = turndownService.turndown(htmlContent);

    const lastDotIndex = key.lastIndexOf('.');
    const mdKey = key.substring(0, lastDotIndex) + '.md';

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: mdKey,
      Body: markdown,
      ContentType: 'text/markdown; charset=utf-8',
    }));

    console.log(`Written: s3://${bucket}/${mdKey}`);
  }
}
