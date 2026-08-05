require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.argv[2];
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.argv[3];
const region = process.env.AWS_REGION || process.argv[4] || 'eu-north-1';
const websiteBucket = process.env.AWS_WEBSITE_BUCKET || process.argv[5] || 'dr.dilshadecb';

if (!accessKeyId || !secretAccessKey || !websiteBucket) {
  console.error('Usage: node deploy-to-s3.js <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY> <REGION> <WEBSITE_BUCKET>');
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey }
});

const ROOT_DIR = path.resolve(__dirname, '..');

const getMimeType = (file) => {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
};

async function uploadFileToS3(fullPath, s3Key) {
  const fileBuffer = fs.readFileSync(fullPath);
  console.log(`[Deploy to S3] Uploading ${s3Key}...`);
  await client.send(new PutObjectCommand({
    Bucket: websiteBucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: getMimeType(s3Key)
  }));
}

async function uploadDirectory(dirPath, bucketPrefixes = ['', 'ingneeringwebsite/ingneeringwebsite/']) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file === '.git' || file === 'node_modules' || file === 'backend' || file === 'videos' || file.endsWith('.zip')) continue;
    const fullPath = path.join(dirPath, file);
    const relPath = path.relative(ROOT_DIR, fullPath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      await uploadDirectory(fullPath, bucketPrefixes);
    } else {
      for (const prefix of bucketPrefixes) {
        const cleanRelPath = relPath.replace(/\\/g, '/');
        const s3Key = `${prefix}${cleanRelPath}`;
        await uploadFileToS3(fullPath, s3Key);
      }
    }
  }
}

async function run() {
  console.log(`[Deploy to S3] Deploying static website files to S3 bucket '${websiteBucket}' in ${region}...`);
  try {
    await uploadDirectory(ROOT_DIR);
    console.log(`🎉 Successfully deployed site to S3 bucket '${websiteBucket}'!`);
  } catch (err) {
    console.error(`❌ Deployment failed:`, err);
  }
}

run();
