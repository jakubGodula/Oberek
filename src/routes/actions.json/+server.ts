import { json, type RequestHandler } from '@sveltejs/kit';
import { createActionHeaders } from '@solana/actions';

const ACTIONS_CORS_HEADERS = {
  ...createActionHeaders(),
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 204,
    headers: ACTIONS_CORS_HEADERS
  });
};

export const GET: RequestHandler = async () => {
  const payload = {
    rules: [
      {
        pathPattern: '/*',
        apiPath: '/api/actions/*'
      },
      {
        pathPattern: '/api/actions/**',
        apiPath: '/api/actions/**'
      }
    ]
  };

  return json(payload, {
    headers: ACTIONS_CORS_HEADERS
  });
};
