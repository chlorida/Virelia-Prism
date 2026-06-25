import type { ReviewItem, ReviewSummary } from './types';
import type { ReviewProvider } from './metadataProvider';

export const mockReviewProvider: ReviewProvider = {
  id: 'mock-reviews',
  async getReviewSummary() {
    return null;
  },
  async getReviews() {
    return [];
  },
};

const providers: ReviewProvider[] = [mockReviewProvider];

export async function fetchReviewSummary(catalogId: string): Promise<ReviewSummary | null> {
  for (const provider of providers) {
    const summary = await provider.getReviewSummary(catalogId);
    if (summary) return summary;
  }
  return null;
}

export async function fetchReviews(
  catalogId: string,
  options?: { limit?: number; criticsOnly?: boolean }
): Promise<ReviewItem[]> {
  const results: ReviewItem[] = [];
  for (const provider of providers) {
    const items = await provider.getReviews(catalogId, options);
    results.push(...items);
  }
  return results;
}
