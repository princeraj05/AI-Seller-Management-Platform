const ALLOWED_CATEGORIES = [
  'Fashion',
  'Electronics',
  'Home & Kitchen',
  'Beauty',
  'Grocery',
  'Handicrafts',
  'Jewelry',
  'Footwear',
];

const ALLOWED_CHANNELS = [
  'AMAZON',
  'FLIPKART',
  'MYNTRA',
  'OWN_WEBSITE',
  'POS',
  'amazon',
  'flipkart',
  'myntra',
  'website',
  'pos',
];

export const validateOnboardingInput = (data) => {
  const errors = {};
  const { businessName, ownerName, mobile, email, categories, channels } = data;

  if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
    errors.businessName = 'Business name is required';
  }

  if (!ownerName || typeof ownerName !== 'string' || !ownerName.trim()) {
    errors.ownerName = 'Owner name is required';
  }

  if (!mobile || typeof mobile !== 'string' || !mobile.trim()) {
    errors.mobile = 'Mobile number is required';
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    errors.email = 'Valid email address is required';
  }

  if (categories && !Array.isArray(categories)) {
    errors.categories = 'Categories must be an array';
  } else if (Array.isArray(categories)) {
    const invalidCats = categories.filter((c) => !ALLOWED_CATEGORIES.includes(c));
    if (invalidCats.length > 0) {
      errors.categories = `Invalid category selection: ${invalidCats.join(', ')}`;
    }
  }

  if (channels && !Array.isArray(channels)) {
    errors.channels = 'Channels must be an array';
  } else if (Array.isArray(channels)) {
    const invalidChs = channels.filter((ch) => !ALLOWED_CHANNELS.includes(ch));
    if (invalidChs.length > 0) {
      errors.channels = `Invalid channel selection: ${invalidChs.join(', ')}`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
