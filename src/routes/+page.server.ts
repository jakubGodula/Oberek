import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async () => {
  return { agents: await blinkService.listAgents() };
};
