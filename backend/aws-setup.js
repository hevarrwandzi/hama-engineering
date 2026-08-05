require('dotenv').config();
const { S3Client, CreateBucketCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.argv[2];
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.argv[3];
const region = process.env.AWS_REGION || process.argv[4] || 'us-east-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || process.argv[5] || `hama-engineering-videos-${Date.now()}`;

if (!accessKeyId || !secretAccessKey) {
  console.error('Usage: node aws-setup.js <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY> [REGION] [BUCKET_NAME]');
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey }
});

async function run() {
  console.log(`[AWS Automation] Creating S3 Bucket '${bucketName}' in ${region}...`);
  try {
    const bucketParams = { Bucket: bucketName };
    if (region !== 'us-east-1') {
      bucketParams.CreateBucketConfiguration = { LocationConstraint: region };
    }
    await client.send(new CreateBucketCommand(bucketParams));
    console.log(`✅ S3 Bucket '${bucketName}' created successfully!`);
  } catch (err) {
    if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') {
      console.log(`ℹ️ Bucket '${bucketName}' exists. Proceeding to CORS configuration...`);
    } else {
      console.error(`⚠️ Bucket error: ${err.message}`);
    }
  }

  console.log(`[AWS Automation] Setting CORS rules on bucket '${bucketName}'...`);
  try {
    await client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['POST', 'PUT', 'GET', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag']
          }
        ]
      }
    }));
    console.log(`✅ CORS configuration applied successfully!`);
  } catch (err) {
    console.error(`⚠️ Failed to set CORS: ${err.message}`);
  }

  const envContent = `PORT=3000
AWS_REGION=${region}
AWS_S3_BUCKET_NAME=${bucketName}
AWS_ACCESS_KEY_ID=${accessKeyId}
AWS_SECRET_ACCESS_KEY=${secretAccessKey}
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log(`✅ Configuration saved to backend/.env! Setup complete.`);
}

run();
