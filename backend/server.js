// Before running:
// npm install express multer dotenv axios cors
// create a .env file:
// TELEGRAM_BOT_TOKEN="8339642601:AAEMiQJF4luIfHMnPlbwKvKh7zopDwOJUuA"
// TELEGRAM_CHANNEL_ID="@ash_saves" // Or use the numeric ID like -100123456789

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Configure storage for Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure the uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(cors({ origin: 'http://127.0.0.1:5500' })); // IMPORTANT: Set your frontend's origin
app.use(express.json());

// Endpoint to upload video and send to Telegram
app.post('/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No video file uploaded.');
  }

  const filePath = req.file.path;
  const originalFileName = req.file.originalname;
  const timestamp = new Date().toLocaleString();
  const caption = `Recorded via Interactive 3D Particle System\nAdmin: Akhil Rashed\nTimestamp: ${timestamp}`;

  console.log(`Received file: ${originalFileName}. Attempting Telegram upload...`);

  try {
    const videoData = fs.readFileSync(filePath);

    // Telegram Bot API sendVideo
    const formData = new FormData();
    formData.append('chat_id', CHANNEL_ID);
    formData.append('caption', caption);
    formData.append('video', new Blob([videoData], { type: req.file.mimetype }), originalFileName);
    
    // Using Axios for the multipart/form-data request
    const response = await axios.post(`${TELEGRAM_API}/sendVideo`, formData, {
        headers: formData.getHeaders ? formData.getHeaders() : {} // Needed for correct boundary header
    });

    // Cleanup: Delete the local file after successful upload
    fs.unlinkSync(filePath); 

    res.status(200).json({ 
        message: 'Video successfully uploaded to Telegram.',
        telegramResponse: response.data 
    });

  } catch (error) {
    console.error('Telegram Upload Error:', error.response ? error.response.data : error.message);
    
    // Ensure file is deleted even on failure
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    res.status(500).json({ 
        message: 'Failed to upload video to Telegram.', 
        error: error.response ? error.response.data : 'Server error' 
    });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
  console.log('Ensure you have a .env file with TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.');
});
