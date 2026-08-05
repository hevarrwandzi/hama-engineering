require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

let S3Client, ListObjectsV2Command;
let createPresignedPost;
let s3Client = null;

try {
  const s3Module = require('@aws-sdk/client-s3');
  const presignModule = require('@aws-sdk/s3-presigned-post');
  S3Client = s3Module.S3Client;
  ListObjectsV2Command = s3Module.ListObjectsV2Command;
  createPresignedPost = presignModule.createPresignedPost;

  if (process.env.AWS_S3_BUCKET_NAME && process.env.AWS_REGION) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      } : undefined
    });
    console.log(`[AWS S3] Configured for bucket: ${process.env.AWS_S3_BUCKET_NAME} (${process.env.AWS_REGION})`);
  }
} catch (err) {
  console.log('[AWS S3] SDK not initialized. Using local file storage.');
}

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const SUBMISSIONS_FILE = path.join(__dirname, 'submissions.json');
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');
const UPLOAD_DIR = path.join(ROOT_DIR, 'videos');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage });

function getCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) return { username: 'admin', password: 'admin123' };
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
  } catch (error) {
    return { username: 'admin', password: 'admin123' };
  }
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, item) => {
    if (!item) return cookies;
    const [key, value] = item.split('=').map((part) => part.trim());
    cookies[key] = value;
    return cookies;
  }, {});
}

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  req.session = {
    admin: cookies.adminSession === 'true',
    member: cookies.memberSession === 'true'
  };
  next();
});

function requireAdminApi(req, res, next) {
  if (req.session.admin) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'Admin authentication required.' });
}

function requireMemberApi(req, res, next) {
  if (req.session.member) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'Member authentication required.' });
}

function requireAdminPage(req, res, next) {
  if (req.session.admin) {
    return next();
  }
  return res.redirect('/login');
}

function requireMemberPage(req, res, next) {
  if (req.session.member) {
    return next();
  }
  return res.redirect('/login');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Backend is running' });
});

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, message: 'Please complete all fields.' });
  }

  const submission = {
    id: Date.now().toString(36),
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    createdAt: new Date().toISOString()
  };

  let submissions = [];
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    try {
      submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
    } catch (error) {
      submissions = [];
    }
  }

  submissions.push(submission);
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));

  res.status(200).json({ ok: true, message: 'Message received successfully.', submission });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const credentials = getCredentials();

  if (username === credentials.username && password === credentials.password) {
    res.setHeader('Set-Cookie', [
      'adminSession=true; HttpOnly; Path=/',
      'memberSession=false; HttpOnly; Path=/'
    ]);
    return res.json({ ok: true, message: 'Login successful.', role: 'admin' });
  }

  if (username === 'member' && password === 'member123') {
    res.setHeader('Set-Cookie', [
      'memberSession=true; HttpOnly; Path=/',
      'adminSession=false; HttpOnly; Path=/'
    ]);
    return res.json({ ok: true, message: 'Login successful.', role: 'member' });
  }

  return res.status(401).json({ ok: false, message: 'Invalid username or password.' });
});

app.get('/api/member-videos', requireMemberApi, async (req, res) => {
  const cdnDomain = process.env.CLOUDFRONT_DOMAIN ? `https://${process.env.CLOUDFRONT_DOMAIN}` : '';

  if (s3Client && process.env.AWS_S3_BUCKET_NAME) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Prefix: 'videos/'
      });
      const data = await s3Client.send(command);
      const s3Videos = (data.Contents || [])
        .filter((item) => item.Size > 0 && !item.Key.endsWith('/'))
        .map((item) => {
          const fileName = item.Key.replace('videos/', '');
          const videoUrl = cdnDomain 
            ? `${cdnDomain}/${item.Key}` 
            : `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`;
          return { name: fileName, url: videoUrl, source: 's3' };
        });

      return res.json({ ok: true, videos: s3Videos });
    } catch (err) {
      console.error('[AWS S3 Error]', err);
    }
  }

  // Fallback to local videos
  const videosDir = path.join(ROOT_DIR, 'videos');
  if (!fs.existsSync(videosDir)) {
    return res.json({ ok: true, videos: [] });
  }

  const files = fs.readdirSync(videosDir)
    .filter((name) => fs.statSync(path.join(videosDir, name)).isFile())
    .map((name) => ({
      name,
      url: `/videos/${name}`,
      source: 'local'
    }));

  res.json({ ok: true, videos: files });
});

app.post('/api/get-upload-url', requireAdminApi, async (req, res) => {
  const { fileName, fileType } = req.body || {};

  if (!s3Client || !process.env.AWS_S3_BUCKET_NAME) {
    return res.json({ ok: true, s3Mode: false });
  }

  try {
    const safeName = (fileName || 'video.mp4').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `videos/${Date.now()}-${safeName}`;

    const presignedPost = await createPresignedPost(s3Client, {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Conditions: [
        ['content-length-range', 0, 500 * 1024 * 1024] // Up to 500MB
      ],
      Expires: 900 // 15 mins
    });

    const cdnDomain = process.env.CLOUDFRONT_DOMAIN ? `https://${process.env.CLOUDFRONT_DOMAIN}` : '';
    const videoUrl = cdnDomain 
      ? `${cdnDomain}/${key}` 
      : `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return res.json({
      ok: true,
      s3Mode: true,
      url: presignedPost.url,
      fields: presignedPost.fields,
      key,
      videoUrl
    });
  } catch (error) {
    console.error('[AWS S3 Presigned URL Error]', error);
    return res.status(500).json({ ok: false, message: 'Failed to generate S3 upload URL.' });
  }
});

app.get('/api/submissions', requireAdminApi, (req, res) => {
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    const submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
    return res.json({ ok: true, submissions });
  }

  res.json({ ok: true, submissions: [] });
});

app.post('/api/upload-video', requireAdminApi, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'No video file was uploaded.' });
  }

  const relativePath = `/videos/${req.file.filename}`;
  res.json({ ok: true, message: 'Video uploaded successfully.', file: relativePath });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'login.html'));
});

app.get(['/admin', '/admin.html'], requireAdminPage, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'admin.html'));
});

app.get(['/member', '/member.html'], requireMemberPage, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'member.html'));
});

app.use(express.static(ROOT_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
