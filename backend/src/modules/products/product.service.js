import { Product } from './product.model.js';
import { ProductVariant } from './productVariant.model.js';

// Fallback in-memory store if DB is offline or buffering
export const inMemoryProductsMap = new Map();

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
    images,
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
