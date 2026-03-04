import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Oyster World',
    short_name: 'Oyster World',
    description: 'Your world, your games.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080c1a',
    theme_color: '#080c1a',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
