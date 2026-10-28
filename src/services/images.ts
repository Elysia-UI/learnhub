import manifest from '../data/optimized-images.json';

interface ImageVariant {
  src: string;
  width: number;
  height: number;
  originalBytes: number;
  bytes: number;
}

const variants: Readonly<Record<string, ImageVariant>> = manifest;

/** Only replace exact, known public assets. Uploaded/private/external URLs are untouched. */
export function publicImage(source: string | undefined): string {
  if (!source || !Object.hasOwn(variants, source)) return source || '';
  return variants[source]!.src;
}
