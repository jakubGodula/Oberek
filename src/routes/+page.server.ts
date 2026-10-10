import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';

export const load: PageServerLoad = async ({ url }) => {
  const agents = await blinkService.listAgents();
  const history = blinkService.getActionHistory(15);
  const { chain } = await getFleetRuntime();

  return {
    agents,
    history,
    origin: url.origin,
    chain
  };
};
