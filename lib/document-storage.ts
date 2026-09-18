import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket=process.env.DOCUMENT_STORAGE_BUCKET || "documents";

function getClient() {
  const accessKeyId=process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey=process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint=process.env.AWS_ENDPOINT_URL_S3;
  const region=process.env.AWS_REGION || "eu-central-1";

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle:true,
    credentials:{accessKeyId,secretAccessKey},
  });
}

export function isDocumentStorageConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_ENDPOINT_URL_S3,
  );
}

export async function uploadDocumentObject({
  key,
  body,
  contentType,
}: {
  key:string;
  body:Uint8Array;
  contentType:string;
}) {
  const client=getClient();
  await client.send(new PutObjectCommand({
    Bucket:bucket,
    Key:key,
    Body:body,
    ContentType:contentType,
  }));
}

export async function getDocumentObject(key:string) {
  const client=getClient();
  return client.send(new GetObjectCommand({
    Bucket:bucket,
    Key:key,
  }));
}
