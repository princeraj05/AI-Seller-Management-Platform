// Pre/post-flight checks for Task 10 (prints no secrets)
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import '../src/config/env.js';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Product } from '../src/modules/products/product.model.js';
import { isCloudinaryConfigured, getLocalUploadRoot, isLocalOrRelativeUrl } from '../src/config/storage.js';

const ID = '6afc6bde33fea5b5a9c3cd73';
const mode = process.argv[2] || 'pre';

await connectDB();
const p = await Product.findById(ID).lean();
if (!p) { console.log('PRODUCT_NOT_FOUND'); process.exit(1); }

const out = {
  productId: String(p._id), sellerId: String(p.sellerId), sku: p.sku,
  masterPrice: p.masterPrice, stock: p.stock, updatedAt: p.updatedAt,
  images: p.images.map((u, i) => ({ index: i, url: u, legacyLocal: isLocalOrRelativeUrl(u) })),
};
for (const img of out.images.filter((x) => x.legacyLocal)) {
  const f = path.join(getLocalUploadRoot(), img.url.replace(/^\/?uploads\//, ''));
  img.file = f;
  img.exists = fs.existsSync(f);
  if (img.exists) {
    const buf = fs.readFileSync(f);
    img.bytes = buf.length;
    img.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  }
}

if (mode === 'pre') {
  out.cloudinaryConfigured = isCloudinaryConfigured();
  if (out.cloudinaryConfigured) {
    const cn = process.env.CLOUDINARY_CLOUD_NAME;
    const auth = Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString('base64');
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cn}/usage`, { headers: { Authorization: `Basic ${auth}` } });
    out.cloudinaryCredentialCheck = r.ok ? `VALID (HTTP ${r.status})` : `INVALID (HTTP ${r.status})`;
  }
  const dir = path.resolve('migration_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `preflight_${ID}_${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ productId: out.productId, sellerId: out.sellerId, masterPrice: p.masterPrice, stock: p.stock, images: p.images }, null, 2));
  const verify = JSON.parse(fs.readFileSync(file, 'utf8'));
  out.backupFile = file;
  out.backupVerified = JSON.stringify(verify.images) === JSON.stringify(p.images);
} else {
  const cloud = p.images.filter((u) => u.startsWith('https://res.cloudinary.com/'));
  out.httpChecks = [];
  for (const u of cloud) {
    const r = await fetch(u);
    out.httpChecks.push({ url: u, status: r.status, contentType: r.headers.get('content-type') });
  }
}
console.log(JSON.stringify(out, null, 2));
await mongoose.disconnect();
process.exit(0);
