import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async ({ url }) => {
  const agents = await blinkService.listAgents();

  return {
    agents,
    origin: url.origin
  };
};
