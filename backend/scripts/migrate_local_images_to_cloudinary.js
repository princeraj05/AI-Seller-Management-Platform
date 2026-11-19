/**
 * Legacy local image -> Cloudinary migration (non-destructive).
 *
 * Usage:
 *   node backend/scripts/migrate_local_images_to_cloudinary.js            # dry run (default)
 *   node backend/scripts/migrate_local_images_to_cloudinary.js --apply    # upload + replace URLs
 *
 * Guarantees:
 *  - Never deletes local files or products.
 *  - Original images array is backed up to backend/migration_backups/<timestamp>.json before any write.
 *  - Only local/relative/localhost entries are replaced, order preserved.
 *  - Missing files are reported and left untouched.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/config/env.js';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Product } from '../src/modules/products/product.model.js';
import { isLocalOrRelativeUrl, isCloudinaryConfigured, getLocalUploadRoot } from '../src/config/storage.js';
import { uploadBufferOrDataUriToCloudinary } from '../src/config/cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const resolveLocalFile = (url) => {
  const clean = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i, '');
  const rel = clean.replace(/^\/?uploads\//, '');
  return path.join(getLocalUploadRoot(), rel);
};

const mimeFor = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
};

const run = async () => {
  if (APPLY && !isCloudinaryConfigured()) {
    console.error('Cloudinary is not configured. Cannot --apply.');
    process.exit(1);
  }
  await connectDB();
  const products = await Product.find({}).lean();
  const affected = products.filter((p) => (p.images || []).some((u) => isLocalOrRelativeUrl(u)));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'} | products scanned: ${products.length} | with legacy local images: ${affected.length}`);

  const backup = [];
  const report = [];

  for (const p of affected) {
    const newImages = [];
    for (const url of p.images) {
      if (!isLocalOrRelativeUrl(url)) {
        newImages.push(url);
        continue;
      }
      const file = resolveLocalFile(url);
      const exists = fs.existsSync(file);
      const entry = { productId: String(p._id), sellerId: String(p.sellerId), url, file, exists, action: 'none' };

      if (!exists) {
        entry.action = 'MISSING_FILE_KEPT';
        newImages.push(url);
      } else if (APPLY) {
        try {
          const dataUri = `data:${mimeFor(file)};base64,${fs.readFileSync(file).toString('base64')}`;
          const up = await uploadBufferOrDataUriToCloudinary({ sellerId: String(p.sellerId), dataUri, folder: 'products' });
          entry.action = 'MIGRATED';
          entry.newUrl = up.secure_url;
          entry.public_id = up.public_id;
          newImages.push(up.secure_url);
        } catch (err) {
          entry.action = `FAILED_KEPT: ${err.message}`;
          newImages.push(url);
        }
      } else {
        entry.action = 'WOULD_MIGRATE';
        newImages.push(url);
      }
      report.push(entry);
    }

    if (APPLY && JSON.stringify(newImages) !== JSON.stringify(p.images)) {
      backup.push({ productId: String(p._id), sellerId: String(p.sellerId), images: p.images });
    }
    p.__newImages = newImages;
  }

  if (APPLY && backup.length > 0) {
    const dir = path.resolve(__dirname, '../migration_backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `images_backup_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`Backup written: ${file}`);
    for (const p of affected) {
      if (JSON.stringify(p.__newImages) !== JSON.stringify(p.images)) {
        await Product.updateOne({ _id: p._id, sellerId: p.sellerId }, { $set: { images: p.__newImages } });
      }
    }
  }

  console.table(report.map(({ productId, url, exists, action, newUrl }) => ({ productId, url, exists, action, newUrl: newUrl || '' })));
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
