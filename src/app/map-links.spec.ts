import { describe, expect, it } from 'vitest';
import { googleMapsSearchUrl } from './map-links';

describe('povezave krajev izvajanja', () => {
  it('ustvari Google Maps iskanje z varno kodiranim naslovom', () => {
    expect(googleMapsSearchUrl('  Tržaška cesta 25, 1000 Ljubljana  ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Tr%C5%BEa%C5%A1ka%20cesta%2025%2C%201000%20Ljubljana',
    );
  });
});
