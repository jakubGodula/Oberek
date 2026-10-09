import { json, type RequestHandler } from '@sveltejs/kit';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const GET: RequestHandler = async ({ url }) => {
  const agentId = url.searchParams.get('agentId') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const history = blinkService.getActionHistory(limit, agentId);

  return json({
    success: true,
    count: history.length,
    history
  });
};
