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
        <title>GamerHoard — your local game library</title>
        <meta name="description" content="Your videogame library, backlog, completions and stats. Local and private. Import your Steam library in one click." />
        <meta name="theme-color" content="#0A0A0F" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta property="og:site_name" content="GamerHoard" />
        <meta property="og:title" content="GamerHoard — your local game library" />
        <meta property="og:description" content="Library, backlog, completions and stats. Local and private." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
