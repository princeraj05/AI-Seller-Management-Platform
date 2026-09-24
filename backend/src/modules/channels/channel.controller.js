import { validateConnectChannelInput } from './channel.validator.js';
import {
  connectChannelService,
  getChannelsService,
  getChannelByIdService,
  disconnectChannelService,
  testChannelConnectionService,
  syncChannelService,
  publishProductToChannelService,
} from './channel.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const connectChannel = async (req, res) => {
  try {
    const providerParam = req.params.provider ? req.params.provider.toUpperCase() : req.body.provider;
    const bodyWithProvider = { ...req.body, provider: providerParam };

    const { isValid, errors } = validateConnectChannelInput(bodyWithProvider);
    if (!isValid) {
      return errorResponse(res, 400, 'Channel connection validation failed', errors);
    }

    const channel = await connectChannelService(req.tenant, bodyWithProvider);
    return successResponse(res, 201, `Channel ${channel.displayName} connected successfully`, { channel });
  } catch (error) {
    console.error('Connect Channel Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to connect channel');
  }
};

export const getChannels = async (req, res) => {
  try {
    const channels = await getChannelsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Channels fetched successfully', { channels });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch channels');
  }
};

export const getChannelById = async (req, res) => {
  try {
    const channel = await getChannelByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel details fetched successfully', { channel });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Channel connection not found');
  }
};

export const disconnectChannel = async (req, res) => {
  try {
    const channel = await disconnectChannelService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel disconnected successfully', { channel });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to disconnect channel');
  }
};

export const testChannelConnection = async (req, res) => {
  try {
    const result = await testChannelConnectionService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel connection test completed', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Connection test failed');
  }
};

export const syncChannel = async (req, res) => {
  try {
    const result = await syncChannelService(req.tenant, req.params.id, req.body.syncType);
    return successResponse(res, 200, 'Channel sync initiated successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to sync channel');
  }
};

export const publishProductToChannel = async (req, res) => {
  try {
    const { productId, channelId } = req.params;
    const result = await publishProductToChannelService(req.tenant, productId, channelId);
    return successResponse(res, 200, 'Product published to channel successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to publish product to channel');
  }
};

export const getChannelHealth = async (req, res) => {
  try {
    const channels = await getChannelsService(req.tenant.sellerId);
    const total = channels.length;
    const connected = channels.filter((c) => c.status === 'CONNECTED').length;
    const errorCount = channels.filter((c) => c.status === 'ERROR' || c.status === 'REAUTH_REQUIRED').length;

    return successResponse(res, 200, 'Channel health status fetched successfully', {
      totalChannels: total,
      connectedChannels: connected,
      errorChannels: errorCount,
      reauthRequiredChannels: channels.filter((c) => c.status === 'REAUTH_REQUIRED').length,
      channels,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch channel health');
  }
};
