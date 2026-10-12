import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async ({ url }) => {
  return { agents: await blinkService.listAgents(), origin: url.origin };
};
