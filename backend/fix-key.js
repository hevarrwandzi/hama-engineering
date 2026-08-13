const { S3Client, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'eu-north-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'hama-engineering-videos';

const s3 = new S3Client({
  region,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
});

async function fixRenamedKey() {
  const oldKey = 'videos/part-one';
  const newKey = 'videos/part-one.MOV';
  console.log(`Fixing renamed S3 key from ${oldKey} to ${newKey}...`);

  try {
    await s3.send(new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${oldKey}`,
      Key: newKey
    }));
    await s3.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: oldKey
    }));
    console.log('Successfully renamed key on S3!');
  } catch (err) {
    console.error('Error fixing key:', err);
  }
}

fixRenamedKey();
