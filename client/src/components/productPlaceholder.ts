/**
 * Inline placeholder for a product with no usable image.
 *
 * A data URI rather than an external service: via.placeholder.com — which this
 * app used to call — stopped responding, and a dead image host does not 404, it
 * hangs. Every card missing an image was holding a request open until the
 * browser gave up. A placeholder must never need the network.
 */
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#F5F5F7"/>
  <g fill="none" stroke="#C7C7CC" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M140 250 L180 205 L215 245 L240 220 L275 260"/>
    <rect x="120" y="150" width="160" height="120" rx="10"/>
  </g>
  <circle cx="165" cy="185" r="12" fill="#C7C7CC"/>
</svg>`.trim();

export const PRODUCT_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(svg)}`;
