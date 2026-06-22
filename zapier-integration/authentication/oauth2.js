/**
 * OrthoClinic OAuth2 Authentication — Authorization Code + PKCE
 *
 * Authorization server:  https://api.orthoclinic.com.br/oauth/authorize
 * Token endpoint:        https://api.orthoclinic.com.br/oauth/token
 * Revocation endpoint:   https://api.orthoclinic.com.br/oauth/revoke
 * JWKS:                  https://api.orthoclinic.com.br/.well-known/jwks.json
 * Discovery:             https://api.orthoclinic.com.br/.well-known/openid-configuration
 *
 * Scopes requested:
 *   patients:read  patients:write
 *   appointments:read  appointments:write
 *   webhooks:read  webhooks:write
 */

'use strict';

const BASE_URL = 'https://api.orthoclinic.com.br';

/**
 * Redirect the user to OrthoClinic's consent page.
 * Zapier supplies the code_challenge/verifier for PKCE automatically.
 */
const getAuthorizationUrl = (z, bundle) => {
  const params = new URLSearchParams({
    client_id:             bundle.authData.client_id,
    redirect_uri:          bundle.authData.redirect_uri,
    response_type:         'code',
    scope:                 [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'webhooks:read',
      'webhooks:write',
    ].join(' '),
    state:                 bundle.inputData.state,
    code_challenge:        bundle.inputData.code_challenge,
    code_challenge_method: 'S256',
  });
  return `${BASE_URL}/oauth/authorize?${params}`;
};

/**
 * Exchange the authorization code for access + refresh tokens.
 */
const getAccessToken = async (z, bundle) => {
  const response = await z.request({
    url:    `${BASE_URL}/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code:          bundle.inputData.code,
      redirect_uri:  bundle.authData.redirect_uri,
      client_id:     bundle.authData.client_id,
      client_secret: bundle.authData.client_secret,
      code_verifier: bundle.inputData.code_verifier,
    }).toString(),
  });

  const data = response.json;
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    token_type:    data.token_type,
    scope:         data.scope,
  };
};

/**
 * Use the refresh token to get a new access token.
 */
const refreshAccessToken = async (z, bundle) => {
  const response = await z.request({
    url:    `${BASE_URL}/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: bundle.authData.refresh_token,
      client_id:     bundle.authData.client_id,
      client_secret: bundle.authData.client_secret,
    }).toString(),
  });

  const data = response.json;
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || bundle.authData.refresh_token,
    expires_in:    data.expires_in,
  };
};

/**
 * Test the connection by fetching the current user's identity.
 * Called after authentication to verify credentials are valid.
 */
const testAuth = async (z, bundle) => {
  const response = await z.request({
    url:     `${BASE_URL}/api/v1/patients`,
    method:  'GET',
    params:  { limit: 1 },
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });

  if (response.status === 401) {
    throw new z.errors.RefreshAuthError();
  }

  // Return something Zapier can display as the "connected account" label.
  return {
    id:    'orthoclinic',
    label: 'OrthoClinic Account',
  };
};

module.exports = {
  type: 'oauth2',
  oauth2Config: {
    authorizeUrl:     getAuthorizationUrl,
    getAccessToken:   getAccessToken,
    refreshAccessToken: refreshAccessToken,
    autoRefresh:      true,
    // PKCE support
    enablePkce:       true,
    scope: [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'webhooks:read',
      'webhooks:write',
    ].join(' '),
  },

  // Fields shown to the user in Zapier's auth dialog
  fields: [
    {
      key:      'client_id',
      label:    'Client ID',
      type:     'string',
      required: true,
      helpText: 'Obtain from your OrthoClinic developer portal at Settings > API > OAuth Applications.',
    },
    {
      key:      'client_secret',
      label:    'Client Secret',
      type:     'password',
      required: true,
      helpText: 'The client secret shown once when you created your OAuth application.',
    },
  ],

  test: testAuth,

  connectionLabel: (z, bundle) => {
    return `OrthoClinic — ${bundle.authData.client_id}`;
  },
};
