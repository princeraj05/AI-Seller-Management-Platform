import { Category } from './category.model.js';

const SYSTEM_DEFAULT_CATEGORIES = [
  { name: 'Fashion', slug: 'fashion', description: 'Clothing, Apparel & Accessories', isGlobal: true },
  { name: 'Electronics', slug: 'electronics', description: 'Mobiles, Gadgets & Devices', isGlobal: true },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Home Decor, Kitchen & Living', isGlobal: true },
  { name: 'Beauty', slug: 'beauty', description: 'Personal Care & Cosmetics', isGlobal: true },
  { name: 'Grocery', slug: 'grocery', description: 'Food & Beverages', isGlobal: true },
  { name: 'Handicrafts', slug: 'handicrafts', description: 'Handmade & Traditional Items', isGlobal: true },
  { name: 'Jewelry', slug: 'jewelry', description: 'Fashion & Fine Jewelry', isGlobal: true },
  { name: 'Footwear', slug: 'footwear', description: 'Shoes, Sandals & More', isGlobal: true },
];

export const getCategoriesService = async (sellerId) => {
  let categories = [];
  try {
    categories = await Category.find({
      $or: [{ isGlobal: true }, { sellerId }],
    }).sort({ name: 1 });
  } catch (err) {
    console.warn('Category fetch from DB bypassed:', err.message);
  }

  if (categories.length === 0) {
    return SYSTEM_DEFAULT_CATEGORIES;
  }

  return categories;
};

export const createCategoryService = async (tenant, categoryData) => {
  const { sellerId, storeId } = tenant;
  const { name, description, image } = categoryData;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  let category = null;
  try {
    category = await Category.create({
      sellerId,
      storeId,
      name,
      slug,
      description: description || '',
      image: image || '',
      isGlobal: false,
      status: 'Active',
    });
  } catch (err) {
    console.warn('DB category creation failed:', err.message);
    category = {
      _id: `cat-${Date.now()}`,
      sellerId,
      name,
      slug,
      description,
      isGlobal: false,
    };
  }

  return category;
};
