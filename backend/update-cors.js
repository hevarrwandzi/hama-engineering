const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'eu-north-1';

const s3 = new S3Client({
  region,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
});

async function fixCorsAll() {
  for (const bucketName of ['hama-engineering-videos', 'dr.dilshadecb']) {
    console.log(`Updating CORS for bucket: ${bucketName}...`);
    try {
      await s3.send(new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
              AllowedOrigins: ['*'],
              ExposeHeaders: ['ETag']
            }
          ]
        }
      }));
      console.log(`Successfully updated CORS for ${bucketName}`);
    } catch (err) {
      console.error(`Error updating CORS for ${bucketName}:`, err);
    }
  }
}

fixCorsAll();
