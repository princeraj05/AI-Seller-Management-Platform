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
