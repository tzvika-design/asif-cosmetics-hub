const express = require('express');
const axios = require('axios');

const router = express.Router();

// Meta Graph API base URL
const GRAPH_API = 'https://graph.facebook.com/v18.0';

// Get config from environment
const getConfig = () => ({
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
  pageId: process.env.META_PAGE_ID,
  instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID
});

// GET /api/meta/status - Check connection status
router.get('/status', async (req, res) => {
  const config = getConfig();

  const status = {
    configured: !!(config.appId && config.pageAccessToken),
    appId: config.appId ? '✓ Set' : '✗ Missing',
    pageAccessToken: config.pageAccessToken ? '✓ Set' : '✗ Missing',
    pageId: config.pageId ? '✓ Set' : '✗ Missing',
    instagramAccountId: config.instagramAccountId ? '✓ Set' : '✗ Missing'
  };

  // If we have a token, try to verify it
  if (config.pageAccessToken) {
    try {
      const response = await axios.get(`${GRAPH_API}/me`, {
        params: { access_token: config.pageAccessToken }
      });

      status.connected = true;
      status.page = {
        id: response.data.id,
        name: response.data.name
      };
    } catch (error) {
      status.connected = false;
      status.error = error.response?.data?.error?.message || error.message;
    }
  } else {
    status.connected = false;
  }

  res.json(status);
});

// GET /api/meta/pages - List connected pages
router.get('/pages', async (req, res) => {
  const { pageAccessToken } = getConfig();

  if (!pageAccessToken) {
    return res.status(400).json({
      error: true,
      message: 'META_PAGE_ACCESS_TOKEN not configured'
    });
  }

  try {
    const response = await axios.get(`${GRAPH_API}/me/accounts`, {
      params: { access_token: pageAccessToken }
    });

    res.json({
      success: true,
      pages: response.data.data || []
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// POST /api/meta/facebook/post - Publish to Facebook page
router.post('/facebook/post', async (req, res) => {
  const { message, link, imageUrl } = req.body;
  const { pageAccessToken, pageId } = getConfig();

  if (!pageAccessToken || !pageId) {
    return res.status(400).json({
      error: true,
      message: 'META_PAGE_ACCESS_TOKEN and META_PAGE_ID required'
    });
  }

  if (!message) {
    return res.status(400).json({
      error: true,
      message: 'Message is required'
    });
  }

  try {
    let postData = { message, access_token: pageAccessToken };

    // Add link if provided
    if (link) {
      postData.link = link;
    }

    // If image URL provided, post as photo
    if (imageUrl) {
      const response = await axios.post(`${GRAPH_API}/${pageId}/photos`, {
        url: imageUrl,
        caption: message,
        access_token: pageAccessToken
      });

      return res.json({
        success: true,
        postId: response.data.id,
        type: 'photo'
      });
    }

    // Regular text/link post
    const response = await axios.post(`${GRAPH_API}/${pageId}/feed`, postData);

    res.json({
      success: true,
      postId: response.data.id,
      type: link ? 'link' : 'text'
    });

  } catch (error) {
    console.error('Facebook post error:', error.response?.data || error.message);
    res.status(500).json({
      error: true,
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// POST /api/meta/instagram/post - Publish to Instagram
router.post('/instagram/post', async (req, res) => {
  const { imageUrl, caption } = req.body;
  const { pageAccessToken, instagramAccountId } = getConfig();

  if (!pageAccessToken || !instagramAccountId) {
    return res.status(400).json({
      error: true,
      message: 'META_PAGE_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID required'
    });
  }

  if (!imageUrl) {
    return res.status(400).json({
      error: true,
      message: 'Image URL is required for Instagram posts'
    });
  }

  try {
    // Step 1: Create media container
    const containerResponse = await axios.post(
      `${GRAPH_API}/${instagramAccountId}/media`,
      {
        image_url: imageUrl,
        caption: caption || '',
        access_token: pageAccessToken
      }
    );

    const creationId = containerResponse.data.id;

    // Step 2: Publish the media
    const publishResponse = await axios.post(
      `${GRAPH_API}/${instagramAccountId}/media_publish`,
      {
        creation_id: creationId,
        access_token: pageAccessToken
      }
    );

    res.json({
      success: true,
      mediaId: publishResponse.data.id,
      containerId: creationId
    });

  } catch (error) {
    console.error('Instagram post error:', error.response?.data || error.message);
    res.status(500).json({
      error: true,
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// GET /api/meta/instagram/account - Get Instagram account info
router.get('/instagram/account', async (req, res) => {
  const { pageAccessToken, instagramAccountId } = getConfig();

  if (!pageAccessToken || !instagramAccountId) {
    return res.status(400).json({
      error: true,
      message: 'META_PAGE_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID required'
    });
  }

  try {
    const response = await axios.get(
      `${GRAPH_API}/${instagramAccountId}`,
      {
        params: {
          fields: 'id,username,name,profile_picture_url,followers_count,media_count',
          access_token: pageAccessToken
        }
      }
    );

    res.json({
      success: true,
      account: response.data
    });

  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// POST /api/meta/ai-post - Generate and post using AI
router.post('/ai-post', async (req, res) => {
  const { topic, platform, style } = req.body;

  // This will be implemented with Claude AI to generate posts
  res.json({
    success: false,
    message: 'AI post generation coming soon',
    params: { topic, platform, style }
  });
});

module.exports = router;
