import { json, type RequestHandler } from '@sveltejs/kit';
import { ONCHAIN_LOG_LIMIT } from '#lib/onchain-log';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agentId') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || String(ONCHAIN_LOG_LIMIT), 10);

  const history = await blinkService.getOnchainLog(limit, agentId);

  return json({
    success: true,
    count: history.length,
    history
  });
};
