import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async ({ url }) => {
  const agents = blinkService.listAgents();
  const history = blinkService.getActionHistory(15);

  return {
    agents,
    history,
    origin: url.origin
  };
};
