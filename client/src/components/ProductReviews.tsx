import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import StarRating from './StarRating';
import type { PaginatedReviews, Review } from '../types/api';

interface Props {
  productId: string;
  /** Lets the parent refresh the headline rating after a review is posted. */
  onRatingChange?: () => void;
}

const ProductReviews = ({ productId, onRatingChange }: Props) => {
  const { user, isAuthenticated } = useAuthStore();

  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<PaginatedReviews | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [myReview, setMyReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axiosClient.get<PaginatedReviews>(
        `/products/${productId}/reviews`,
        { params: { page, limit: 5 } },
      );
      setReviews(res);
    } catch (error) {
      console.error('Failed to load reviews', error);
    } finally {
      setIsLoading(false);
    }
  }, [productId, page]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Pre-fill the form when the visitor has already reviewed this product, so
  // posting again reads as editing rather than as a duplicate.
  useEffect(() => {
    if (!isAuthenticated) {
      setMyReview(null);
      return;
    }

    let cancelled = false;

    axiosClient
      .get<Review | null>(`/products/${productId}/reviews/mine`)
      .then((mine) => {
        if (cancelled || !mine) return;
        setMyReview(mine);
        setRating(mine.rating);
        setTitle(mine.title ?? '');
        setComment(mine.comment ?? '');
      })
      .catch(() => {
        /* Not reviewed yet, or not signed in — nothing to pre-fill. */
      });

    return () => {
      cancelled = true;
    };
  }, [productId, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating < 1) {
      toast.error('Pick a star rating first.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await axiosClient.post<Review>(`/products/${productId}/reviews`, {
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });

      setMyReview(saved);
      toast.success(myReview ? 'Your review was updated.' : 'Thanks for your review!');
      setPage(1);
      await fetchReviews();
      onRatingChange?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save your review.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this review?')) return;

    try {
      await axiosClient.delete(`/reviews/${id}`);
      toast.success('Review deleted.');
      if (id === myReview?.id) {
        setMyReview(null);
        setRating(0);
        setTitle('');
        setComment('');
      }
      await fetchReviews();
      onRatingChange?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete the review.'));
    }
  };

  const summary = reviews?.summary;

  return (
    <section className="mt-20 border-t border-gray-100 pt-16">
      <h2 className="text-2xl font-black uppercase tracking-tight mb-10">
        Ratings &amp; reviews
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

        {/* Summary: average plus the star breakdown */}
        <div className="lg:col-span-4">
          <div className="bg-[#F5F5F7] rounded-3xl p-8">
            <div className="flex items-end gap-3 mb-2">
              {/* An em dash at 5xl font-black renders as a solid black bar, which
                  reads as a glitch. Show a muted placeholder instead. */}
              {summary && summary.total > 0 ? (
                <>
                  <span className="text-5xl font-black tracking-tighter leading-none">
                    {summary.average.toFixed(1)}
                  </span>
                  <span className="text-sm font-bold text-gray-400 pb-1">/ 5</span>
                </>
              ) : (
                <span className="text-2xl font-black tracking-tight leading-none text-gray-300">
                  Not rated
                </span>
              )}
            </div>

            <StarRating value={summary?.average ?? 0} size={18} className="mb-3" />

            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-8">
              {summary?.total ?? 0} review{summary?.total === 1 ? '' : 's'}
            </p>

            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = summary?.distribution?.[star] ?? 0;
                const total = summary?.total ?? 0;
                const percent = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-gray-500 w-3">{star}</span>
                    <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-gray-400 w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Write form + the list itself */}
        <div className="lg:col-span-8 space-y-10">

          {isAuthenticated ? (
            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-3xl p-8">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6">
                {myReview ? 'Edit your review' : 'Write a review'}
              </h3>

              <div className="mb-6">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                  Your rating
                </label>
                <StarRating value={rating} size={28} onChange={setRating} />
              </div>

              <div className="mb-4">
                <label htmlFor="review-title" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                  Headline <span className="text-gray-300">(optional)</span>
                </label>
                <input
                  id="review-title"
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sums up your experience"
                  className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all"
                />
              </div>

              <div className="mb-6">
                <label htmlFor="review-comment" className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                  Details <span className="text-gray-300">(optional)</span>
                </label>
                <textarea
                  id="review-comment"
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What did you like or dislike?"
                  className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl py-4 px-5 text-sm font-medium outline-none transition-all resize-none min-h-[120px]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                {myReview ? 'Update review' : 'Post review'}
              </button>
            </form>
          ) : (
            <div className="bg-[#F5F5F7] rounded-3xl p-8 text-center">
              <p className="text-sm font-medium text-gray-500 mb-5">
                Sign in to share what you think about this product.
              </p>
              <Link
                to="/login"
                className="inline-block bg-black text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all"
              >
                Sign in
              </Link>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gray-300" size={28} />
            </div>
          ) : reviews && reviews.data.length > 0 ? (
            <>
              <div className="space-y-8">
                {reviews.data.map((review) => (
                  <article key={review.id} className="border-b border-gray-100 pb-8 last:border-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <StarRating value={review.rating} size={14} />
                          {review.isVerifiedPurchase && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600">
                              <BadgeCheck size={13} />
                              Verified purchase
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                          {review.authorName} · {new Date(review.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Own review, or an admin moderating */}
                      {(review.userId === user?.id || user?.role === 'ADMIN') && (
                        <button
                          type="button"
                          onClick={() => handleDelete(review.id)}
                          aria-label="Delete review"
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {review.title && (
                      <h4 className="text-base font-black mb-2">{review.title}</h4>
                    )}
                    {review.comment && (
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                        {review.comment}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              {reviews.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-5 py-3 rounded-xl bg-[#F5F5F7] text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-gray-200 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    {page} / {reviews.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= reviews.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-5 py-3 rounded-xl bg-[#F5F5F7] text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-gray-200 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm font-medium text-gray-400 py-8 text-center">
              No reviews yet. Be the first to write one.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductReviews;
