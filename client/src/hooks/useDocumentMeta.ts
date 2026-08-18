import { useEffect } from 'react';

interface Meta {
  title: string;
  description?: string;
  image?: string;
  /** Set to true on pages that must never be indexed (cart, checkout, account). */
  noIndex?: boolean;
}

const SITE = 'NEXUS';
const DEFAULT_DESCRIPTION =
  'Premium electronics and audio, engineered for people who work with their gear every day.';

// Writes or replaces a meta/link tag, tracking the ones we own so they can be
// torn down when the page unmounts.
const setTag = (
  selector: string,
  create: () => HTMLElement,
  apply: (el: HTMLElement) => void,
): HTMLElement => {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    el.dataset.managed = 'true';
    document.head.appendChild(el);
  }
  apply(el);
  return el;
};

const setMeta = (attr: 'name' | 'property', key: string, content: string) =>
  setTag(
    `meta[${attr}="${key}"]`,
    () => {
      const el = document.createElement('meta');
      el.setAttribute(attr, key);
      return el;
    },
    (el) => el.setAttribute('content', content),
  );

// Keeps the document title and social/crawler tags in step with the route.
//
// This is a client-side SPA, so a crawler that does not execute JavaScript sees
// only index.html. These tags cover the crawlers that do (Google, and link
// unfurlers that run JS); real per-product SEO would need server rendering.
const useDocumentMeta = ({ title, description, image, noIndex }: Meta) => {
  useEffect(() => {
    const full = title === SITE ? SITE : `${title} · ${SITE}`;
    const desc = description ?? DEFAULT_DESCRIPTION;
    const url = window.location.href;

    document.title = full;

    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', desc);

    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:image', image);
    }

    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    setTag(
      'link[rel="canonical"]',
      () => {
        const el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        return el;
      },
      (el) => el.setAttribute('href', window.location.origin + window.location.pathname),
    );
  }, [title, description, image, noIndex]);
};

export default useDocumentMeta;
