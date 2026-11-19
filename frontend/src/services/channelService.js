import api from './api';

export const getChannelsApi = async (params = {}) => {
  try {
    const response = await api.get('/channels', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch channels');
    }
    throw new Error(error.message || 'Network error fetching channels');
  }
};

export const getChannelByIdApi = async (channelId) => {
  try {
    const response = await api.get(`/channels/${channelId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch channel details');
    }
    throw new Error(error.message || 'Network error fetching channel details');
  }
};

export const connectChannelApi = async (provider, connectData) => {
  try {
    const response = await api.post(`/channels/${provider}/connect`, connectData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to connect channel');
    }
    throw new Error(error.message || 'Network error connecting channel');
  }
};

export const disconnectChannelApi = async (channelId) => {
  try {
    const response = await api.post(`/channels/${channelId}/disconnect`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to disconnect channel');
    }
    throw new Error(error.message || 'Network error disconnecting channel');
  }
};

export const testChannelConnectionApi = async (channelId) => {
  try {
    const response = await api.post(`/channels/${channelId}/test`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to test channel connection');
    }
    throw new Error(error.message || 'Network error testing channel connection');
  }
};

export const syncChannelApi = async (channelId, syncType = 'FULL') => {
  try {
    const response = await api.post(`/channels/${channelId}/sync`, { syncType });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to sync channel');
    }
    throw new Error(error.message || 'Network error syncing channel');
  }
};

export const publishProductToChannelApi = async (productId, channelId) => {
  try {
    const response = await api.post(`/channels/publish/${productId}/${channelId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to publish product');
    }
    throw new Error(error.message || 'Network error publishing product');
  }
};

export const getAmazonStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon connection status');
    }
    throw new Error(error.message || 'Network error fetching Amazon status');
  }
};

export const initiateAmazonOAuthApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/oauth/initiate', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to initiate Amazon OAuth');
    }
    throw new Error(error.message || 'Network error initiating Amazon OAuth');
  }
};

export const connectAmazonManualApi = async (data) => {
  try {
    const response = await api.post('/channels/amazon/connect-manual', data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to connect Amazon account');
    }
    throw new Error(error.message || 'Network error connecting Amazon account');
  }
};

export const disconnectAmazonApi = async () => {
  try {
    const response = await api.post('/channels/amazon/disconnect');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to disconnect Amazon');
    }
    throw new Error(error.message || 'Network error disconnecting Amazon');
  }
};

export const testAmazonConnectionApi = async () => {
  try {
    const response = await api.post('/channels/amazon/test');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to test Amazon connection');
    }
    throw new Error(error.message || 'Network error testing Amazon connection');
  }
};

export const searchAmazonCatalogApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/catalog/search', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to search Amazon catalog');
    }
    throw new Error(error.message || 'Network error searching Amazon catalog');
  }
};

export const getAmazonCatalogItemApi = async (asin, params = {}) => {
  try {
    const response = await api.get(`/channels/amazon/catalog/${asin}`, { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon catalog item');
    }
    throw new Error(error.message || 'Network error getting Amazon catalog item');
  }
};

export const getAmazonListingsApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/listings', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon listings');
    }
    throw new Error(error.message || 'Network error fetching Amazon listings');
  }
};

export const getAmazonListingBySkuApi = async (sku, params = {}) => {
  try {
    const response = await api.get(`/channels/amazon/listings/${sku}`, { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon listing details');
    }
    throw new Error(error.message || 'Network error fetching Amazon listing details');
  }
};

export const triggerAmazonSyncApi = async (body = {}) => {
  try {
    const response = await api.post('/channels/amazon/sync', body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to trigger Amazon synchronization');
    }
    throw new Error(error.message || 'Network error triggering Amazon sync');
  }
};

export const getAmazonSyncStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/sync/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon sync status');
    }
    throw new Error(error.message || 'Network error getting Amazon sync status');
  }
};

export const getAmazonInventoryApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/inventory', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon inventory');
    }
    throw new Error(error.message || 'Network error fetching Amazon inventory');
  }
};

export const getAmazonInventoryBySkuApi = async (sku) => {
  try {
    const response = await api.get(`/channels/amazon/inventory/${sku}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon inventory item');
    }
    throw new Error(error.message || 'Network error fetching Amazon inventory item');
  }
};

export const triggerAmazonInventorySyncApi = async (body = {}) => {
  try {
    const response = await api.post('/channels/amazon/inventory/sync', body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to trigger Amazon inventory sync');
    }
    throw new Error(error.message || 'Network error triggering Amazon inventory sync');
  }
};

export const getAmazonInventoryStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/inventory/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon inventory status');
    }
    throw new Error(error.message || 'Network error getting Amazon inventory status');
  }
};

export const getAmazonPricingApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/pricing', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon pricing snapshots');
    }
    throw new Error(error.message || 'Network error fetching Amazon pricing');
  }
};

export const getAmazonPricingBySkuApi = async (sku) => {
  try {
    const response = await api.get(`/channels/amazon/pricing/${sku}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon pricing item');
    }
    throw new Error(error.message || 'Network error fetching Amazon pricing item');
  }
};

export const triggerAmazonPricingSyncApi = async (body = {}) => {
  try {
    const response = await api.post('/channels/amazon/pricing/sync', body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to trigger Amazon pricing sync');
    }
    throw new Error(error.message || 'Network error triggering Amazon pricing sync');
  }
};

export const getAmazonPricingStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/pricing/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon pricing status');
    }
    throw new Error(error.message || 'Network error getting Amazon pricing status');
  }
};

/**
 * Task 6: Amazon Orders Read-Only API
 */
export const getAmazonOrdersApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/orders', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon orders');
    }
    throw new Error(error.message || 'Network error fetching Amazon orders');
  }
};

export const getAmazonOrderByIdApi = async (orderId) => {
  try {
    const response = await api.get(`/channels/amazon/orders/${orderId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon order details');
    }
    throw new Error(error.message || 'Network error fetching Amazon order');
  }
};

export const triggerAmazonOrdersSyncApi = async (body = {}) => {
  try {
    const response = await api.post('/channels/amazon/orders/sync', body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to trigger Amazon orders sync');
    }
    throw new Error(error.message || 'Network error triggering Amazon orders sync');
  }
};

export const getAmazonOrdersStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/orders/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon orders status');
    }
    throw new Error(error.message || 'Network error getting Amazon orders status');
  }
};

// ==========================================
// Task 7: Order Details & Returns Visibility
// ==========================================

export const getAmazonOrderDetailsApi = async (orderId, params = {}) => {
  try {
    const response = await api.get(`/channels/amazon/orders/${orderId}/details`, { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon order details');
    }
    throw new Error(error.message || 'Network error fetching Amazon order details');
  }
};

export const getAmazonOrderItemsApi = async (orderId) => {
  try {
    const response = await api.get(`/channels/amazon/orders/${orderId}/items`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon order items');
    }
    throw new Error(error.message || 'Network error fetching Amazon order items');
  }
};

export const syncSingleAmazonOrderApi = async (orderId) => {
  try {
    const response = await api.post(`/channels/amazon/orders/${orderId}/sync`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to sync Amazon order');
    }
    throw new Error(error.message || 'Network error syncing Amazon order');
  }
};

export const getAmazonOrderRefundsApi = async (orderId) => {
  try {
    const response = await api.get(`/channels/amazon/orders/${orderId}/refunds`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon order refunds');
    }
    throw new Error(error.message || 'Network error fetching Amazon order refunds');
  }
};

export const getAmazonReturnsApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/returns', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon returns');
    }
    throw new Error(error.message || 'Network error fetching Amazon returns');
  }
};

export const getAmazonReturnByIdApi = async (returnId) => {
  try {
    const response = await api.get(`/channels/amazon/returns/${returnId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon return details');
    }
    throw new Error(error.message || 'Network error fetching Amazon return details');
  }
};

export const triggerAmazonReturnsSyncApi = async (body = {}) => {
  try {
    const response = await api.post('/channels/amazon/returns/sync', body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to trigger Amazon returns sync');
    }
    throw new Error(error.message || 'Network error triggering Amazon returns sync');
  }
};

export const getAmazonReturnsStatusApi = async () => {
  try {
    const response = await api.get('/channels/amazon/returns/status');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to get Amazon returns status');
    }
    throw new Error(error.message || 'Network error getting Amazon returns status');
  }
};

// ==========================================
// TASK 9: AMAZON PRODUCT LISTING & PUBLISHING WORKFLOW (SANDBOX ONLY)
// ==========================================

export const getAmazonEligibleProductsApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/products/eligible', { params });
    const raw = response.data;
    const products = Array.isArray(raw?.data?.products)
      ? raw.data.products
      : Array.isArray(raw?.products)
      ? raw.products
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
      ? raw
      : [];

    return {
      success: true,
      data: products,
      products,
      pagination: raw?.data?.pagination || raw?.pagination || { total: products.length },
    };
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch catalogue products');
    }
    throw new Error(error.message || 'Network error fetching catalogue products');
  }
};

export const getAmazonProductTypesApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/definitions/product-types', { params });
    const raw = response.data;
    const types = Array.isArray(raw?.data?.productTypes)
      ? raw.data.productTypes
      : Array.isArray(raw?.productTypes)
      ? raw.productTypes
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
      ? raw
      : [];

    return {
      success: true,
      data: { productTypes: types },
      productTypes: types,
    };
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch Amazon product types');
    }
    throw new Error(error.message || 'Network error fetching Amazon product types');
  }
};

export const getAmazonProductTypeSchemaApi = async (productType, params = {}) => {
  try {
    const response = await api.get(`/channels/amazon/definitions/product-types/${productType}`, { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || `Failed to fetch schema for ${productType}`);
    }
    throw new Error(error.message || `Network error fetching schema for ${productType}`);
  }
};

export const validateAmazonListingApi = async (payload) => {
  try {
    const response = await api.post('/channels/amazon/listings/submissions/validate', payload);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      return error.response.data; // Return structured validation response even on 422
    }
    throw new Error(error.message || 'Network error validating listing data');
  }
};

export const createAmazonListingSubmissionApi = async (payload) => {
  try {
    const response = await api.post('/channels/amazon/listings/submissions', payload);
    const raw = response.data;
    const subDoc = raw?.data?.submission || raw?.submission || raw?.data;
    return {
      success: raw?.success ?? true,
      message: raw?.message || 'Listing submission saved successfully',
      data: subDoc,
      submission: subDoc,
      valid: raw?.data?.valid,
      issues: raw?.data?.issues,
    };
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to save listing submission');
    }
    throw new Error(error.message || 'Network error saving listing submission');
  }
};

export const submitAmazonListingApi = async (submissionId, body = {}) => {
  try {
    const response = await api.post(`/channels/amazon/listings/submissions/${submissionId}/submit`, body);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      return {
        success: false,
        message: error.response.data.message || 'Listing submission was rejected',
        code: error.response.data.code,
        data: error.response.data.data,
      };
    }
    throw new Error(error.message || 'Network error executing listing submission');
  }
};

export const getAmazonListingSubmissionsApi = async (params = {}) => {
  try {
    const response = await api.get('/channels/amazon/listings/submissions', { params });
    const raw = response.data;
    const list = Array.isArray(raw?.data?.submissions)
      ? raw.data.submissions
      : Array.isArray(raw?.submissions)
      ? raw.submissions
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
      ? raw
      : [];

    return {
      success: true,
      data: list,
      submissions: list,
      pagination: raw?.data?.pagination || raw?.pagination || { total: list.length },
    };
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch listing submissions');
    }
    throw new Error(error.message || 'Network error fetching listing submissions');
  }
};

export const getAmazonListingSubmissionByIdApi = async (submissionId) => {
  try {
    const response = await api.get(`/channels/amazon/listings/submissions/${submissionId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch submission details');
    }
    throw new Error(error.message || 'Network error fetching submission details');
  }
};





