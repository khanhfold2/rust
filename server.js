const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Endpoint tải và stream trực tiếp APK về trình duyệt (KHÔNG CẦN R2 STORAGE!)
app.get('/stream-apk', async (req, res) => {
  const { appId, source, version } = req.query;
  
  if (!appId) {
    return res.status(400).send('Missing appId parameter');
  }

  let selectedSource = source || 'apkpure';
  const tempDir = '/tmp';
  
  // Chuẩn hóa tên nguồn tải
  if (selectedSource === 'googleplay' || selectedSource === 'playstore') {
    selectedSource = 'google-play';
  }

  // Tạo lệnh chạy apkeep CLI
  let command = `apkeep -d ${selectedSource}`;

  // Cấu hình bảo mật nâng cao cho Google Play Store
  if (selectedSource === 'google-play') {
    const email = process.env.GOOGLE_PLAY_EMAIL;
    const token = process.env.GOOGLE_PLAY_AAS_TOKEN;
    
    if (email && token) {
      command += ` -e "${email}" -t "${token}"`;
    } else {
      console.warn("Cảnh báo: Thiếu GOOGLE_PLAY_EMAIL hoặc GOOGLE_PLAY_AAS_TOKEN trong biến môi trường!");
      return res.status(400).send('Google Play downloads require credentials. Please configure GOOGLE_PLAY_EMAIL and GOOGLE_PLAY_AAS_TOKEN on Render.');
    }
  }

  // Thêm tham số package app
  if (version) {
    command += ` -a "${appId}@${version}"`;
  } else {
    command += ` -a "${appId}"`;
  }
  command += ` ${tempDir}`;

  console.log(`Executing command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Exec error: ${error.message}`);
      return res.status(500).send(`Failed to download APK via apkeep: ${error.message}`);
    }

    try {
      // Tìm tệp APK trong thư mục tạm /tmp
      const files = fs.readdirSync(tempDir);
      const apkFile = files.find(f => f.startsWith(appId) && f.endsWith('.apk'));

      if (!apkFile) {
        return res.status(404).send('APK file not found after download');
      }

      const filePath = path.join(tempDir, apkFile);
      const fileStats = fs.statSync(filePath);

      // Thiết lập Header trả về file APK trực tiếp cho trình duyệt tải xuống
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${apkFile}"`);
      res.setHeader('Content-Length', fileStats.size);

      // Stream file thẳng về response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      // Sau khi hoàn tất truyền dữ liệu, xóa file tạm để tránh đầy bộ nhớ đĩa
      fileStream.on('end', () => {
        fs.unlinkSync(filePath);
        console.log(`Successfully streamed and deleted temporary file: ${apkFile}`);
      });

      fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

    } catch (err) {
      console.error('Processing error:', err);
      return res.status(500).send(`Processing error: ${err.message}`);
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Downloader service listening on port ${PORT}`);
});
