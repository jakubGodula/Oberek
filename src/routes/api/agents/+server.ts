import { json, type RequestHandler } from '@sveltejs/kit';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const GET: RequestHandler = async () => {
  const agents = await blinkService.listAgents();
  return json({
    success: true,
    agents
  });
};
