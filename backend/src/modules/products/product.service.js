import { Product } from './product.model.js';
import { ProductVariant } from './productVariant.model.js';
import { isProductionEnv, isPublicHttpsUrl, isLocalOrRelativeUrl, isPersistentLocalAllowed } from '../../config/storage.js';

// Fallback in-memory store if DB is offline or buffering
export const inMemoryProductsMap = new Map();

/**
 * Normalize product image URLs (trim, string-only, dedupe).
 * Production: only public HTTPS URLs are accepted (no localhost, relative /uploads, or http://),
 * unless a persistent local disk is explicitly configured, in which case /uploads paths are allowed.
 * Throws a descriptive error instead of silently dropping images.
 */
export const sanitizeProductImages = (images) => {
  if (images === undefined) return undefined;
  if (!Array.isArray(images)) {
    throw new Error('images must be an array of URL strings.');
  }
  const cleaned = [];
  for (const raw of images) {
    const url = typeof raw === 'string' ? raw.trim() : (raw?.secure_url || raw?.url || '').trim();
    if (url && !cleaned.includes(url)) cleaned.push(url);
  }

  if (isProductionEnv()) {
    const allowLocalPaths = isPersistentLocalAllowed();
    const invalid = cleaned.filter((u) => {
      if (isPublicHttpsUrl(u)) return false;
      if (allowLocalPaths && u.startsWith('/uploads/')) return false;
      return true;
    });
    if (invalid.length > 0) {
      const err = new Error(
        `Invalid product image URL(s) for production: ${invalid.join(', ')}. Only public HTTPS URLs (e.g. Cloudinary secure_url) are allowed. Run the image migration script for legacy local images.`
      );
      err.code = 'INVALID_IMAGE_URL';
      throw err;
    }
  } else {
    const invalid = cleaned.filter(
      (u) => !isPublicHttpsUrl(u) && !(isLocalOrRelativeUrl(u) && u.startsWith('/uploads/')) && !u.startsWith('http')
    );
    if (invalid.length > 0) {
      throw new Error(`Invalid product image URL(s): ${invalid.join(', ')}`);
    }
  }
  return cleaned;
};

export const createProductService = async (tenant, productData) => {
  const { sellerId, storeId } = tenant;
  const {
    sku,
    title,
    description,
    shortDescription,
    brand,
    categoryName,
    masterPrice,
    costPrice,
    stock,
    variants,
    attributes,
    seo,
    material,
    color,
    keywords,
    tags,
    aiGenerated,
    aiApproved,
  } = productData;
  const images = sanitizeProductImages(productData.images) || [];

  const normalizedSku = sku.toUpperCase().trim();

  let existing = null;
  try {
    existing = await Product.findOne({ sellerId, sku: normalizedSku });
  } catch (err) {
    console.warn('DB lookup for existing SKU failed/bypassed:', err.message);
    const existingInMemory = Array.from(inMemoryProductsMap.values()).find(
      (p) => p.sellerId === sellerId && p.sku === normalizedSku
    );
    if (existingInMemory) {
      throw new Error(`Product with SKU '${normalizedSku}' already exists for this seller.`);
    }
  }

  if (existing) {
    throw new Error(`Product with SKU '${normalizedSku}' already exists for this seller.`);
  }

  let product = null;
  try {
    product = await Product.create({
      sellerId,
      storeId,
      sku: normalizedSku,
      title,
      description: description || '',
      shortDescription: shortDescription || '',
      brand: brand || 'Bhartiye Crafts',
      categoryName: categoryName || 'Fashion',
      masterPrice,
      costPrice: costPrice || 0,
      stock: stock || 0,
      images: images || [],
      material: material || '',
      color: color || '',
      attributes: attributes || {},
      seo: seo || {},
      keywords: keywords || [],
      tags: tags || [],
      aiGenerated: !!aiGenerated,
      aiApproved: !!aiApproved,
      status: 'Active',
    });

    if (variants && Array.isArray(variants) && variants.length > 0) {
      const variantDocs = variants.map((v) => ({
        sellerId,
        storeId,
        productId: product._id,
        sku: v.sku ? v.sku.toUpperCase().trim() : `${normalizedSku}-${v.size || 'V'}-${v.color || '1'}`,
        size: v.size || '',
        color: v.color || '',
        price: v.price || masterPrice,
        stock: v.stock || 0,
        status: 'Active',
      }));
      await ProductVariant.insertMany(variantDocs);
    }
  } catch (dbErr) {
    console.warn('MongoDB product creation bypassed/failed, using in-memory fallback:', dbErr.message);
    const id = `prod-${Date.now()}`;
    product = {
      _id: id,
      id,
      sellerId,
      storeId,
      sku: normalizedSku,
      title,
      description: description || '',
      shortDescription: shortDescription || '',
      brand: brand || 'Bhartiye Crafts',
      categoryName: categoryName || 'Fashion',
      masterPrice,
      costPrice: costPrice || 0,
      stock: stock || 0,
      images: images || [],
      material: material || '',
      color: color || '',
      attributes: attributes || {},
      seo: seo || {},
      keywords: keywords || [],
      tags: tags || [],
      aiGenerated: !!aiGenerated,
      aiApproved: !!aiApproved,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryProductsMap.set(id, product);
  }

  return product;
};

export const getProductsService = async (sellerId, query = {}) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { sellerId };

  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { sku: { $regex: query.search, $options: 'i' } },
    ];
  }

  if (query.category && query.category !== 'All') {
    filter.categoryName = query.category;
  }

  if (query.status) {
    filter.status = query.status;
  }

  let products = [];
  let total = 0;

  try {
    products = await Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    total = await Product.countDocuments(filter);
  } catch (err) {
    console.warn('DB products fetch bypassed/failed, using fallback array:', err.message);
    let memList = Array.from(inMemoryProductsMap.values()).filter((p) => p.sellerId === sellerId);
    if (query.search) {
      const q = query.search.toLowerCase();
      memList = memList.filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (query.category && query.category !== 'All') {
      memList = memList.filter((p) => p.categoryName === query.category);
    }
    total = memList.length;
    products = memList.slice(skip, skip + limit);
  }

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getProductByIdService = async (sellerId, productId) => {
  let product = null;
  try {
    product = await Product.findOne({ _id: productId, sellerId });
  } catch (err) {
    console.warn('DB fetch product by ID failed:', err.message);
    const p = inMemoryProductsMap.get(productId);
    if (p && p.sellerId === sellerId) {
      product = p;
    }
  }

  if (!product) {
    const p = inMemoryProductsMap.get(productId);
    if (p && p.sellerId === sellerId) {
      return p;
    }
    throw new Error('Product not found or unauthorized');
  }

  return product;
};

export const updateProductService = async (sellerId, productId, updateData) => {
  // Never allow changing sellerId or storeId
  delete updateData.sellerId;
  delete updateData.storeId;

  if (updateData.images !== undefined) {
    updateData.images = sanitizeProductImages(updateData.images);
  }

  let product = null;
  try {
    product = await Product.findOneAndUpdate(
      { _id: productId, sellerId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
  } catch (err) {
    console.warn('DB update product failed:', err.message);
  }

  if (!product) {
    const p = inMemoryProductsMap.get(productId);
    if (p && p.sellerId === sellerId) {
      Object.assign(p, updateData, { updatedAt: new Date() });
      inMemoryProductsMap.set(productId, p);
      return p;
    }
    throw new Error('Product not found or unauthorized');
  }

  return product;
};

export const deleteProductService = async (sellerId, productId) => {
  let deleted = null;
  try {
    deleted = await Product.findOneAndDelete({ _id: productId, sellerId });
    if (deleted) {
      await ProductVariant.deleteMany({ productId: deleted._id, sellerId });
    }
  } catch (err) {
    console.warn('DB delete product failed:', err.message);
  }

  if (!deleted) {
    const p = inMemoryProductsMap.get(productId);
    if (p && p.sellerId === sellerId) {
      inMemoryProductsMap.delete(productId);
      return { success: true, id: productId };
    }
    throw new Error('Product not found or unauthorized');
  }

  return { success: true, id: productId };
};
