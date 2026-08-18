import { Star } from 'lucide-react';

// Props for the star rating.
interface Props {
  value: number;
  size?: number;

  onChange?: (rating: number) => void;
  className?: string;
}

// Renders a star rating, interactive when given an onChange.
const StarRating = ({ value, size = 16, onChange, className = '' }: Props) => {
  const isInteractive = typeof onChange === 'function';

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={isInteractive ? 'radiogroup' : 'img'}
      aria-label={isInteractive ? 'Choose a rating' : `Rated ${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - star + 1));

        const starIcon = (
          <span className="relative block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-gray-200" fill="currentColor" strokeWidth={0} />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star size={size} className="text-amber-400" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );

        if (!isInteractive) return <span key={star}>{starIcon}</span>;

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={Math.round(value) === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => onChange(star)}
            className="transition-transform hover:scale-110 cursor-pointer"
          >
            {starIcon}
          </button>
        );
      })}
    </div>
  );
};

export default StarRating;
