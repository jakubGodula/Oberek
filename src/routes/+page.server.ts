import type { PageServerLoad } from './$types';
import { ONCHAIN_LOG_LIMIT } from '#lib/onchain-log';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async ({ url }) => {
  const agents = await blinkService.listAgents();
  const history = await blinkService.getOnchainLog(ONCHAIN_LOG_LIMIT);

  return {
    agents,
    history,
    origin: url.origin
  };
};
