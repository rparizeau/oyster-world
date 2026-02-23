import type { GameModule } from './types';
import { terriblePeopleModule } from './terrible-people';
import { fourKateModule } from './4-kate';

const modules: Record<string, GameModule> = {
  'terrible-people': terriblePeopleModule as GameModule,
  '4-kate': fourKateModule as GameModule,
};

export function getGameModule(gameId: string): GameModule | undefined {
  return modules[gameId];
}
