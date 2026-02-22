import type { BlackCard, WhiteCard } from './types';
import type { CardData } from './game-engine';
import cardsJson from '../../data/cards.json';

let cachedCards: CardData | null = null;

/**
 * Load card data from the static JSON file. Cached after first load.
 */
export function loadCards(): CardData {
  if (cachedCards) return cachedCards;

  cachedCards = {
    black: cardsJson.black as BlackCard[],
    white: cardsJson.white as WhiteCard[],
  };

  return cachedCards;
}
