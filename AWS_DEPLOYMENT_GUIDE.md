# ☁️ AWS S3 + CloudFront Deployment & Setup Guide

This guide details step-by-step how to deploy **Hama Engineering** to AWS S3 & CloudFront, configure direct video uploads for admins, and enable video streaming for company members.

---

## 1. Create S3 Buckets

Log into the **AWS Management Console** and navigate to **S3**.

### A. Static Website Bucket
1. Click **Create bucket**.
2. **Bucket name**: `hama-engineering-website` (or your preferred name).
3. **AWS Region**: `us-east-1` (or your closest region).
4. Click **Create bucket**.

### B. Video Storage Bucket
1. Click **Create bucket**.
2. **Bucket name**: `hama-engineering-videos`.
3. **AWS Region**: `us-east-1` (same region).
4. Click **Create bucket**.

---

## 2. Configure CORS on Video S3 Bucket

To allow admin browsers to upload videos directly to S3:

1. Open your `hama-engineering-videos` bucket in AWS Console.
2. Go to the **Permissions** tab.
3. Scroll down to **Cross-origin resource sharing (CORS)** and click **Edit**.
4. Paste the following CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["POST", "PUT", "GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```
5. Click **Save changes**.

---

## 3. Create CloudFront CDN Distribution

1. Navigate to **CloudFront** in AWS Console.
2. Click **Create distribution**.
3. **Origin domain**: Select your S3 bucket (`hama-engineering-website.s3.amazonaws.com`).
4. **Origin access**: Select **Origin access control settings (recommended)** -> Create new OAC.
5. **Viewer protocol policy**: Select **Redirect HTTP to HTTPS**.
6. Click **Create distribution**.
7. *(Optional)* Add an additional Origin for the `hama-engineering-videos` bucket under `/videos/*` path behavior.

---

## 4. Set Up Environment Variables for Backend

Inside your backend deployment environment (e.g. AWS Lightsail, App Runner, EC2, or `.env` file):

Create a `.env` file in `backend/`:

```env
PORT=3000

# AWS S3 Config
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=hama-engineering-videos
AWS_ACCESS_KEY_ID=AKIA...YOUR_AWS_KEY
AWS_SECRET_ACCESS_KEY=...YOUR_AWS_SECRET

# CloudFront Distribution Domain
CLOUDFRONT_DOMAIN=d1234567890.cloudfront.net
```

---

## 5. Test Video Uploads & Streaming

1. Start your backend server: `npm start` inside `backend/`.
2. Open `http://localhost:3000/login` or your deployed domain.
3. Log in as Admin (`admin` / `admin123`).
4. Go to Admin Dashboard (`/admin`).
5. Select a video file and click **Upload Video**.
   - You will see live upload progress: `Uploading to AWS S3... (45%)`.
6. Log in as Member (`member` / `member123`) on `/member` to stream the uploaded video via CloudFront!
