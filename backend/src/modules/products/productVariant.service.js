import { Product } from './product.model.js';
import { ProductVariant } from './productVariant.model.js';

export const createVariantService = async (tenant, productId, variantData) => {
  const { sellerId, storeId } = tenant;

  // Verify parent product ownership by seller
  const product = await Product.findOne({ _id: productId, sellerId });
  if (!product) {
    throw new Error('Parent product not found or unauthorized');
  }

  const normalizedSku = variantData.sku.toUpperCase().trim();
  const existing = await ProductVariant.findOne({ sellerId, sku: normalizedSku });
  if (existing) {
    throw new Error(`Variant SKU '${normalizedSku}' already exists for this seller.`);
  }

  const variant = await ProductVariant.create({
    sellerId,
    storeId,
    productId: product._id,
    sku: normalizedSku,
    size: variantData.size || '',
    color: variantData.color || '',
    price: variantData.price,
    compareAtPrice: variantData.compareAtPrice || 0,
    stock: variantData.stock || 0,
    attributes: variantData.attributes || {},
    images: variantData.images || [],
    status: 'Active',
  });

  return variant;
};

export const getVariantsService = async (sellerId, productId) => {
  if (productId && productId !== 'all') {
    const product = await Product.findOne({ _id: productId, sellerId });
    if (!product) {
      throw new Error('Parent product not found or unauthorized');
    }
    const variants = await ProductVariant.find({ productId, sellerId });
    return variants;
  }

  const variants = await ProductVariant.find({ sellerId });
  return variants;
};

export const updateVariantService = async (sellerId, productId, variantId, updateData) => {
  delete updateData.sellerId;
  delete updateData.storeId;
  delete updateData.productId;

  const variant = await ProductVariant.findOneAndUpdate(
    { _id: variantId, productId, sellerId },
    { $set: updateData },
    { new: true }
  );

  if (!variant) {
    throw new Error('Variant not found or unauthorized');
  }

  return variant;
};

export const deleteVariantService = async (sellerId, productId, variantId) => {
  const deleted = await ProductVariant.findOneAndDelete({ _id: variantId, productId, sellerId });
  if (!deleted) {
    throw new Error('Variant not found or unauthorized');
  }
  return { success: true, id: variantId };
};
