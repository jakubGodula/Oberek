import type { PageServerLoad } from './$types';
import { ONCHAIN_LOG_LIMIT } from '#lib/onchain-log';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async ({ url }) => {
  const agents = await blinkService.listAgents();
  // The page opens on the first agent; its log is the one shown.
  const history = agents[0] ? await blinkService.getOnchainLog(ONCHAIN_LOG_LIMIT, agents[0].id) : [];

  return {
    agents,
    history,
    origin: url.origin
  };
};
