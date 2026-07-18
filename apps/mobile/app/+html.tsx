import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

// Static HTML shell for the web export: PWA manifest, icons, and social (OG) metadata.
// One shell for every route (SPA), so the OG tags are site-generic.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>GamerHoard — track your videogame collection</title>
        <meta name="description" content="Track your videogames: library, backlog, completions, stats and friends. Import your Steam library in one click." />
        <meta name="theme-color" content="#0A0A0F" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta property="og:site_name" content="GamerHoard" />
        <meta property="og:title" content="GamerHoard — track your videogame collection" />
        <meta property="og:description" content="Library, backlog, completions, stats and friends. Import your Steam library in one click." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://gamer-hoard.com" />
        <meta property="og:image" content="https://gamer-hoard.com/icon-512.png" />
        <meta name="twitter:card" content="summary" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
