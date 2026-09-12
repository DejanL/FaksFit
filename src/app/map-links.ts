const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=';

export function googleMapsSearchUrl(location: string): string {
  return `${GOOGLE_MAPS_SEARCH_URL}${encodeURIComponent(location.trim())}`;
}
