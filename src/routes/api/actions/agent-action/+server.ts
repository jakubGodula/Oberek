import { json, type RequestHandler } from '@sveltejs/kit';
import { createActionHeaders, type ActionPostRequest } from '@solana/actions';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

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

export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agentId') || 'sentinel-01';
  const metadata = blinkService.getActionMetadata(agentId, url.origin);

  return json(metadata, {
    headers: ACTIONS_CORS_HEADERS
  });
};

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const agentId = url.searchParams.get('agentId') || 'sentinel-01';
    const decisionParam = url.searchParams.get('decision') || 'approve';
    const decision: 'approve' | 'pause' = decisionParam === 'pause' ? 'pause' : 'approve';

    const body: ActionPostRequest = await request.json();

    if (!body.account) {
      return json(
        { message: 'Brak wymaganego pola "account" (adres portfela Solana)' },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const postResponse = await blinkService.createDecisionTransaction(body.account, agentId, decision);

    return json(postResponse, {
      headers: ACTIONS_CORS_HEADERS
    });
  } catch (err: any) {
    return json(
      { message: err?.message || 'Błąd przetwarzania akcji Blinka' },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
};
