import Busboy from '@fastify/busboy';
import { errorResponse } from '../utils/apiResponse.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_USER_HINT_LENGTH = 500;

/**
 * Middleware: Streams a single product image into an in-memory Buffer using @fastify/busboy.
 *
 * Enforces:
 * - Request Content-Type must be multipart/form-data with a valid boundary.
 * - Max 10MB image size during streaming (destroys stream if exceeded; zero temporary disk files).
 * - MIME format strictly image/jpeg, image/png, image/webp.
 * - Exactly one file (rejects extra files).
 * - Rejects empty file payloads.
 * - Bounds text fields (user_hint max 500 characters).
 * - Safe resource cleanup on client disconnections, aborts, and malformed requests.
 */
export const uploadProductImageMiddleware = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(
      res,
      400,
      'Invalid Content-Type. Request must be multipart/form-data.',
      'MISSING_MULTIPART_BOUNDARY',
      'MISSING_MULTIPART_BOUNDARY'
    );
  }

  let bb;
  try {
    bb = new Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_FILE_SIZE,
        fields: 10,
        fieldSize: 10 * 1024, // 10KB max per field
      },
    });
  } catch (initErr) {
    return errorResponse(
      res,
      400,
      `Failed to initialize multipart parser: ${initErr.message}`,
      'MALFORMED_MULTIPART_REQUEST',
      'MALFORMED_MULTIPART_REQUEST'
    );
  }

  let fileCount = 0;
  let uploadError = null;
  let finished = false;
  const chunks = [];
  let totalBytes = 0;
  let fileMeta = null;
  const fields = {};

  const cleanup = () => {
    req.removeListener('aborted', onAborted);
    req.removeListener('close', onClose);
  };

  const onAborted = () => {
    chunks.length = 0;
    cleanup();
  };

  const onClose = () => {
    // If request closed before stream finished and before body ended, it was prematurely aborted
    if (!finished && !req.readableEnded && !req.complete) {
      chunks.length = 0;
      cleanup();
    }
  };

  req.on('aborted', onAborted);
  req.on('close', onClose);

  bb.on('file', (fieldname, fileStream, filename, encoding, mimetype) => {
    fileCount++;

    if (fileCount > 1) {
      if (!uploadError) {
        uploadError = {
          status: 400,
          message: 'Only a single product image file is allowed.',
          code: 'MULTIPLE_FILES_REJECTED',
        };
      }
      fileStream.resume(); // Drain and discard additional files
      return;
    }

    const normMime = String(mimetype || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normMime)) {
      if (!uploadError) {
        uploadError = {
          status: 400,
          message: `Unsupported image format '${mimetype}'. Allowed formats: image/jpeg, image/png, image/webp.`,
          code: 'UNSUPPORTED_IMAGE_FORMAT',
        };
      }
      fileStream.resume(); // Drain without buffering
      return;
    }

    fileMeta = {
      filename: filename || 'upload.jpg',
      mimetype: normMime,
      encoding,
    };

    fileStream.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_FILE_SIZE) {
        if (!uploadError) {
          uploadError = {
            status: 400,
            message: `Image size exceeds maximum allowed limit of 10MB.`,
            code: 'IMAGE_SIZE_LIMIT_EXCEEDED',
          };
        }
        fileStream.resume();
        return;
      }
      chunks.push(chunk);
    });

    fileStream.on('limit', () => {
      if (!uploadError) {
        uploadError = {
          status: 400,
          message: `Image size exceeds maximum allowed limit of 10MB.`,
          code: 'IMAGE_SIZE_LIMIT_EXCEEDED',
        };
      }
      fileStream.resume();
    });

    fileStream.on('error', (err) => {
      if (!uploadError) {
        uploadError = {
          status: 400,
          message: `File stream read error: ${err.message}`,
          code: 'FILE_STREAM_ERROR',
        };
      }
    });
  });

  bb.on('filesLimit', () => {
    if (!uploadError) {
      uploadError = {
        status: 400,
        message: 'Only a single product image file is allowed.',
        code: 'MULTIPLE_FILES_REJECTED',
      };
    }
  });

  bb.on('field', (name, val) => {
    fields[name] = val;
    if (name === 'user_hint' && val && val.length > MAX_USER_HINT_LENGTH) {
      if (!uploadError) {
        uploadError = {
          status: 400,
          message: `User hint exceeds maximum allowed length of ${MAX_USER_HINT_LENGTH} characters.`,
          code: 'USER_HINT_TOO_LONG',
        };
      }
    }
  });

  bb.on('error', (err) => {
    cleanup();
    if (!res.headersSent) {
      return errorResponse(
        res,
        400,
        `Malformed multipart request: ${err.message}`,
        'MALFORMED_MULTIPART_REQUEST',
        'MALFORMED_MULTIPART_REQUEST'
      );
    }
  });

  bb.on('finish', () => {
    finished = true;

    if (res.headersSent) {
      cleanup();
      return;
    }

    if (uploadError) {
      cleanup();
      return errorResponse(
        res,
        uploadError.status,
        uploadError.message,
        uploadError.code,
        uploadError.code
      );
    }

    if (fileCount === 0 || !fileMeta) {
      cleanup();
      return errorResponse(
        res,
        400,
        'No product image file uploaded. An image is required.',
        'NO_IMAGE_PROVIDED',
        'NO_IMAGE_PROVIDED'
      );
    }

    if (totalBytes === 0) {
      cleanup();
      return errorResponse(
        res,
        400,
        'Uploaded image file is empty (0 bytes).',
        'EMPTY_IMAGE_PAYLOAD',
        'EMPTY_IMAGE_PAYLOAD'
      );
    }

    const buffer = Buffer.concat(chunks);
    cleanup();

    req.file = {
      buffer,
      originalname: fileMeta.filename,
      mimetype: fileMeta.mimetype,
      size: buffer.length,
    };

    req.body = {
      ...fields,
      ...(req.body || {}),
    };

    next();
  });

  req.pipe(bb);
};
