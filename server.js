const express = require('express');
const { exec } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Cấu hình kết nối Cloudflare R2 thông qua S3 API đại diện
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

app.post('/download', async (req, res) => {
  const { appId, source, version } = req.body;
  
  if (!appId) {
    return res.status(400).json({ error: 'Missing appId' });
  }

  const selectedSource = source || 'apkpure'; // apkpure, fdroid, playstore, huawei, etc.
  const tempDir = '/tmp';
  
  // Tạo dòng lệnh thực thi apkeep CLI
  let command = `apkeep -d ${selectedSource}`;
  if (version) {
    command += ` -a "${appId}@${version}"`;
  } else {
    command += ` -a "${appId}"`;
  }
  command += ` ${tempDir}`;

  console.log(`Executing command: ${command}`);

  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Exec error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to download APK via apkeep', details: error.message });
    }

    try {
      // Tìm tệp APK vừa được tải về trong thư mục tạm /tmp
      const files = fs.readdirSync(tempDir);
      const apkFile = files.find(f => f.startsWith(appId) && f.endsWith('.apk'));

      if (!apkFile) {
        return res.status(404).json({ error: 'APK file not found after download' });
      }

      const filePath = path.join(tempDir, apkFile);
      const fileStream = fs.createReadStream(filePath);
      const fileStats = fs.statSync(filePath);

      // Upload tệp lên Cloudflare R2
      const r2Key = `apks/${apkFile}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileStream,
        ContentLength: fileStats.size,
        ContentType: 'application/vnd.android.package-archive',
      }));

      // Xóa file tạm cục bộ sau khi upload thành công để giải phóng không gian
      fs.unlinkSync(filePath);

      console.log(`Successfully uploaded ${apkFile} to R2.`);
      return res.json({
        success: true,
        fileName: apkFile,
        r2Key: r2Key,
        size: fileStats.size
      });

    } catch (err) {
      console.error('Processing error:', err);
      return res.status(500).json({ error: 'Failed to process and upload APK', details: err.message });
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Downloader service listening on port ${PORT}`);
});
