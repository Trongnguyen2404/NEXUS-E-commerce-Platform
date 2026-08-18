import { useState } from 'react';
import type { Category } from '../types/api';

// Props for the category banner.
interface Props {
  category: Category;
  className?: string;
}

// Deterministic gradients so a category without a banner still looks designed
// rather than showing a broken-image icon.
const GRADIENTS = [
  'from-[#1f2937] via-[#111827] to-[#000000]',
  'from-[#1c5cab] via-[#123a6d] to-[#06182f]',
  'from-[#3f2d63] via-[#241a3a] to-[#0d0916]',
  'from-[#0f3d3e] via-[#0a2627] to-[#04100f]',
];

// Picks a stable gradient from the category id.
const pickGradient = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
};

// Renders a category banner, falling back to a lettered gradient tile.
const CategoryArt = ({ category, className = '' }: Props) => {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(category.imageUrl) && !failed;

  if (showPhoto) {
    return (
      <img
        src={category.imageUrl as string}
        alt=""
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`absolute inset-0 bg-gradient-to-br ${pickGradient(category.id)} flex items-center justify-center ${className}`}
    >
      <span className="text-[26vw] sm:text-[7rem] font-black text-white/10 leading-none select-none">
        {category.name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
};

export default CategoryArt;
