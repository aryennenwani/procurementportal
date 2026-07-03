// Storage for vendor quotation attachments (spec sheets, COAs, datasheets).
// Files live on disk under server/uploads/quotations with UUID names; the original
// filename is kept in the quotation_attachments table and restored on download.
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const QUOTE_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads/quotations');
fs.mkdirSync(QUOTE_UPLOAD_DIR, { recursive: true });

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: QUOTE_UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF, image (PNG/JPG/WebP), Word, and Excel files are accepted.'));
  },
}).array('attachments', MAX_FILES);

// Multer errors (oversize file, bad type, too many) become clean 400 JSON responses
// instead of falling through to the generic 500 handler.
function quoteAttachmentUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Each attachment must be ${MAX_FILE_SIZE / (1024 * 1024)} MB or smaller.`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `You can attach at most ${MAX_FILES} files.`
          : err.message;
      return res.status(400).json({ error: message });
    }
    next();
  });
}

// Removes files already written to disk when the request is rejected after parsing.
function discardUploadedFiles(req) {
  for (const f of req.files || []) {
    fs.unlink(f.path, () => {});
  }
}

module.exports = { QUOTE_UPLOAD_DIR, MAX_FILES, quoteAttachmentUpload, discardUploadedFiles };
