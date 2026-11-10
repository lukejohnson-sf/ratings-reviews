/**
 * Brand-neutral seed data. Everything is derived deterministically from productId,
 * so any product ID "already has reviews" with the same numbers on every call.
 */

export interface Dimension {
  id: string;
  label: string;          // question shown on the write-a-review form
  displayLabel: string;   // heading shown in the summary
  type: 'scale' | 'rating'; // scale = midpoint is ideal (e.g. fit); rating = higher is better
  minLabel: string;
  midLabel?: string;
  maxLabel: string;
  required: boolean;
}

/** Edit this list to rebrand the review dimensions for a demo. Values are always 1-5. */
export const DIMENSIONS: Dimension[] = [
  { id: 'fit', label: 'How is the size and fit?', displayLabel: 'Size & Fit', type: 'scale', minLabel: 'Small', midLabel: 'True to Size', maxLabel: 'Large', required: true },
  { id: 'comfort', label: 'How is the comfort?', displayLabel: 'Comfort', type: 'rating', minLabel: 'Poor', maxLabel: 'Excellent', required: true },
  { id: 'quality', label: 'How is the quality and durability?', displayLabel: 'Quality & Durability', type: 'rating', minLabel: 'Poor', maxLabel: 'Excellent', required: false },
];

export const SUGGESTED_TOPICS = ['Quality', 'Fit', 'Comfort', 'Value', 'Durability', 'Style'];

export const RULES = {
  rating: { min: 1, max: 5 },
  title: { min: 1, max: 50 },
  body: { min: 50, max: 2000 },
  author: { min: 1, max: 40 },
  location: { max: 40 },
};

export interface Review {
  id: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  location: string | null;
  verifiedPurchase: boolean;
  dimensions: Record<string, number>;
  createdAt: string;
  source: 'seed' | 'submitted';
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG so a productId always yields the same sequence. */
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL: { rating: number; title: string; body: string; fit: number; comfort: number; quality: number }[] = [
  { rating: 5, title: 'Exceeded my expectations', body: 'The quality is outstanding for the price. I have already recommended it to friends and family.', fit: 3, comfort: 5, quality: 5 },
  { rating: 5, title: 'Love it!', body: 'Exactly as pictured and arrived quickly. I use it every day and it still looks brand new.', fit: 3, comfort: 5, quality: 5 },
  { rating: 5, title: 'Great value', body: 'Great quality and a good price. Ordering a second one in another color.', fit: 3, comfort: 4, quality: 5 },
  { rating: 5, title: 'Perfect gift', body: 'Bought this as a gift and they absolutely loved it. Beautifully made and nicely packaged.', fit: 3, comfort: 5, quality: 5 },
  { rating: 5, title: 'Would buy again', body: 'Comfortable, well made, and holds up after plenty of use. Easily one of my favorite purchases this year.', fit: 3, comfort: 5, quality: 4 },
  { rating: 4, title: 'Really nice, runs a bit small', body: 'Great quality overall, but it runs a little small. I would size up next time.', fit: 2, comfort: 4, quality: 4 },
  { rating: 4, title: 'Solid choice', body: 'Does exactly what I needed and feels sturdy. Only wish there were more color options.', fit: 3, comfort: 4, quality: 4 },
  { rating: 4, title: 'Happy with it', body: 'Nice material and looks great. Took a few uses to break in but now it is perfect.', fit: 4, comfort: 4, quality: 4 },
  { rating: 3, title: 'Good, not great', body: 'It is fine for the price. The finish is not quite as nice as the photos suggest.', fit: 3, comfort: 3, quality: 3 },
  { rating: 3, title: 'Runs large', body: 'Decent quality but it runs large, so I had to exchange for a smaller size.', fit: 5, comfort: 3, quality: 3 },
];

const NAMES = ['Jennifer', 'Abby', 'Marcus', 'Priya', 'Daniel', 'Sofia', 'Chris', 'Hannah', 'Jamal', 'Emily', 'Luis', 'Grace', 'Ryan', 'Mei', 'Olivia', 'Noah'];
const PLACES = ['Delaware', 'Virginia', 'Texas', 'Ohio', 'California', 'Oregon', 'Georgia', 'Colorado', 'New York', 'Michigan', 'Arizona', 'Florida'];
const SUMMARIES = [
  'Customers consistently praise the **quality** and **comfort**, and many say it is a great value for the price.',
  'Reviewers love the **style** and **durability**, with many noting it still looks new after months of use.',
  'Shoppers highlight the **comfort** and **true-to-size fit**, and many say they plan to buy again.',
  'Customers rave about the **quality** and say it makes a **great gift**, with only a few noting minor sizing differences.',
];

export interface Seed {
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  dimensionTotals: Record<string, { sum: number; count: number }>;
  summaryText: string;
  reviews: Review[];
}

export function seedFor(productId: string): Seed {
  const h = hash(productId);
  const r = rng(h);
  const total = 40 + Math.floor(r() * 4000);
  const p5 = 0.55 + r() * 0.38;
  const rest = 1 - p5;
  const p4 = rest * (0.55 + r() * 0.2);
  const p3 = (rest - p4) * 0.6;
  const p2 = (rest - p4 - p3) * 0.55;
  const c5 = Math.round(total * p5), c4 = Math.round(total * p4), c3 = Math.round(total * p3), c2 = Math.round(total * p2);
  const c1 = Math.max(0, total - c5 - c4 - c3 - c2);

  // 4 reviews: mostly positive, matching a high-average product
  const picks = new Set<number>();
  picks.add(Math.floor(r() * 5));            // a 5-star
  picks.add(Math.floor(r() * 5));            // another 5-star (may collide)
  picks.add(5 + Math.floor(r() * 3));        // a 4-star
  while (picks.size < 4) picks.add(Math.floor(r() * POOL.length));
  const names = [...NAMES];
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const reviews: Review[] = [...picks].map((idx, i) => {
    const t = POOL[idx];
    const daysAgo = 3 + i * 9 + Math.floor(r() * 8);
    return {
      id: `seed-${(h % 100000).toString(36)}-${i + 1}`,
      productId,
      rating: t.rating,
      title: t.title,
      body: t.body,
      author: names[i],
      location: PLACES[Math.floor(r() * PLACES.length)],
      verifiedPurchase: r() > 0.25,
      dimensions: { fit: t.fit, comfort: t.comfort, quality: t.quality },
      createdAt: new Date(Date.UTC(2026, 10, 9) - daysAgo * 86400000).toISOString(),
      source: 'seed',
    };
  });

  const dimensionTotals: Seed['dimensionTotals'] = {
    fit: { sum: total * (2.8 + r() * 0.4), count: total },
    comfort: { sum: total * (4.2 + r() * 0.7), count: total },
    quality: { sum: total * (4.1 + r() * 0.8), count: total },
  };

  return {
    distribution: { '5': c5, '4': c4, '3': c3, '2': c2, '1': c1 },
    dimensionTotals,
    summaryText: SUMMARIES[h % SUMMARIES.length],
    reviews,
  };
}
