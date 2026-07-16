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
        <title>Watch Hoard — track your shows & movies</title>
        <meta name="description" content="Track your shows and movies. Import your TV Time history in one click and keep going — episodes, watchlist, stats, friends." />
        <meta name="theme-color" content="#0A0A0C" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta property="og:site_name" content="Watch Hoard" />
        <meta property="og:title" content="Watch Hoard — track your shows & movies" />
        <meta property="og:description" content="The TV Time successor: import your history, track episodes and movies, share with friends." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://watchhoard.com" />
        <meta property="og:image" content="https://watchhoard.com/icon.svg" />
        <meta name="twitter:card" content="summary" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
