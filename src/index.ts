import { DurableObject } from 'cloudflare:workers';
import { DIMENSIONS, RULES, Review, SUGGESTED_TOPICS, hash, seedFor } from './seed';
import { openapi } from './openapi';

interface Env {
  STORE: DurableObjectNamespace;
  API_KEY: string;
}

interface Ctx { env: Env; store: DurableObjectStorage }

interface ProductState { submitted: Review[]; submissionIds: string[] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

const err = (status: number, code: string, message: string, details?: unknown) =>
  json({ error: { code, message, ...(details ? { details } : {}) } }, status);

const pkey = (id: string) => `product:${id}`;

async function loadState(ctx: Ctx, productId: string): Promise<ProductState> {
  return (await ctx.store.get<ProductState>(pkey(productId))) ?? { submitted: [], submissionIds: [] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function buildSummary(productId: string, state: ProductState) {
  const seed = seedFor(productId);
  const dist = { ...seed.distribution };
  const dims = structuredClone(seed.dimensionTotals);
  for (const r of state.submitted) {
    dist[String(r.rating) as keyof typeof dist]++;
    for (const [k, v] of Object.entries(r.dimensions)) {
      dims[k] ??= { sum: 0, count: 0 };
      dims[k].sum += v;
      dims[k].count++;
    }
  }
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const weighted = Object.entries(dist).reduce((a, [s, c]) => a + Number(s) * c, 0);
  const pct = (c: number) => (total ? Math.round((c / total) * 100) : 0);
  return {
    productId,
    averageRating: total ? round1(weighted / total) : 0,
    totalReviews: total,
    recommendedPercent: pct(dist['5'] + dist['4']),
    ratingDistribution: (['5', '4', '3', '2', '1'] as const).map((s) => ({ stars: Number(s), count: dist[s], percent: pct(dist[s]) })),
    dimensions: DIMENSIONS.map((d) => ({
      id: d.id,
      label: d.displayLabel,
      type: d.type,
      minLabel: d.minLabel,
      midLabel: d.midLabel ?? null,
      maxLabel: d.maxLabel,
      average: dims[d.id]?.count ? round1(dims[d.id].sum / dims[d.id].count) : null,
    })),
    summaryText: seed.summaryText,
  };
}

function allReviews(productId: string, state: ProductState): Review[] {
  return [...state.submitted, ...seedFor(productId).reviews];
}

const SORTS: Record<string, (a: Review, b: Review) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  highest: (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
  lowest: (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
};

const strLen = (v: unknown, min: number, max: number) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const intIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function validate(b: any): Record<string, string> {
  const e: Record<string, string> = {};
  if (!intIn(b?.rating, RULES.rating.min, RULES.rating.max)) e.rating = 'rating must be an integer 1-5';
  if (!strLen(b?.title, RULES.title.min, RULES.title.max)) e.title = `title is required, max ${RULES.title.max} characters`;
  if (!strLen(b?.body, RULES.body.min, RULES.body.max)) e.body = `body must be ${RULES.body.min}-${RULES.body.max} characters`;
  if (!strLen(b?.author, RULES.author.min, RULES.author.max)) e.author = `author is required, max ${RULES.author.max} characters`;
  if (b?.location != null && !strLen(b.location, 0, RULES.location.max)) e.location = `location max ${RULES.location.max} characters`;
  for (const d of DIMENSIONS) {
    const v = b?.dimensions?.[d.id];
    if (v == null) { if (d.required) e[`dimensions.${d.id}`] = `${d.id} is required (1-5)`; }
    else if (!intIn(v, 1, 5)) e[`dimensions.${d.id}`] = `${d.id} must be an integer 1-5`;
  }
  return e;
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type,x-api-key,x-chaos',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      },
    });
  }

  if (path === '/' || path === '/health') return json({ status: 'ok', service: 'Rate Expectations', time: new Date().toISOString() });
  if (path === '/openapi.json') return json(openapi(url.origin));

  if (req.headers.get('x-api-key') !== ctx.env.API_KEY) return err(401, 'UNAUTHORIZED', 'Missing or invalid x-api-key header');

  const chaos = url.searchParams.get('chaos') ?? req.headers.get('x-chaos');
  if (chaos === 'slow') await new Promise((r) => setTimeout(r, 4000));
  if (chaos === 'error') return err(503, 'SERVICE_UNAVAILABLE', 'Chaos mode: forced outage');
  if (chaos === 'flaky' && Math.random() < 0.5) return err(503, 'SERVICE_UNAVAILABLE', 'Chaos mode: flaky failure');

  if (method === 'GET' && path === '/v1/form-config') {
    return json({ dimensions: DIMENSIONS, suggestedTopics: SUGGESTED_TOPICS, rules: RULES });
  }

  if (method === 'POST' && path === '/v1/reset') {
    const deleted = (await ctx.store.list({ prefix: 'product:' })).size;
    await ctx.store.deleteAll();
    return json({ reset: true, productsCleared: deleted });
  }

  // Batch summaries for PLP tiles: GET /v1/summaries?productIds=a,b,c
  if (method === 'GET' && path === '/v1/summaries') {
    const ids = (url.searchParams.get('productIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (!ids.length) return err(400, 'BAD_REQUEST', 'productIds query parameter is required (comma separated, max 50)');
    const out = await Promise.all(ids.map(async (id) => {
      const s = buildSummary(id, await loadState(ctx, id));
      return { productId: id, averageRating: s.averageRating, totalReviews: s.totalReviews };
    }));
    return json({ summaries: out });
  }

  const m = path.match(/^\/v1\/products\/([^/]+)\/(summary|reviews)$/);
  if (m) {
    const productId = decodeURIComponent(m[1]);
    const state = await loadState(ctx, productId);

    if (method === 'GET' && m[2] === 'summary') return json(buildSummary(productId, state));

    if (method === 'GET' && m[2] === 'reviews') {
      const sort = url.searchParams.get('sort') ?? 'newest';
      if (!SORTS[sort]) return err(400, 'BAD_REQUEST', `sort must be one of ${Object.keys(SORTS).join(', ')}`);
      const rating = url.searchParams.get('rating');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10) || 10, 1), 50);
      const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
      let list = allReviews(productId, state).sort(SORTS[sort]);
      if (rating) list = list.filter((r) => r.rating === Number(rating));
      return json({
        productId,
        summary: buildSummary(productId, state),
        reviews: list.slice(offset, offset + limit),
        paging: { sort, limit, offset, returned: Math.min(limit, Math.max(list.length - offset, 0)), totalAvailable: list.length },
      });
    }

    if (method === 'POST' && m[2] === 'reviews') {
      let b: any;
      try { b = await req.json(); } catch { return err(400, 'BAD_REQUEST', 'Body must be JSON'); }
      const errors = validate(b);
      if (Object.keys(errors).length) return err(422, 'VALIDATION_FAILED', 'One or more fields are invalid', errors);

      if (b.submissionId && state.submissionIds.includes(b.submissionId)) {
        const existing = state.submitted.find((r) => r.id === `rv-${hash(productId + b.submissionId).toString(36)}`);
        return json({ review: existing, duplicate: true }, 200);
      }

      const dimensions: Record<string, number> = {};
      for (const d of DIMENSIONS) if (b.dimensions?.[d.id] != null) dimensions[d.id] = b.dimensions[d.id];
      const review: Review = {
        id: b.submissionId ? `rv-${hash(productId + b.submissionId).toString(36)}` : `rv-${crypto.randomUUID().slice(0, 8)}`,
        productId,
        rating: b.rating,
        title: b.title.trim(),
        body: b.body.trim(),
        author: b.author.trim(),
        location: b.location?.trim() || null,
        verifiedPurchase: Boolean(b.customerId),
        dimensions,
        createdAt: new Date().toISOString(),
        source: 'submitted',
      };
      state.submitted.unshift(review);
      if (b.submissionId) state.submissionIds.push(b.submissionId);
      await ctx.store.put(pkey(productId), state);
      return json({ review, summary: buildSummary(productId, state) }, 201);
    }
  }

  return err(404, 'NOT_FOUND', `${method} ${path} not found`);
}

/** One global store: strongly consistent, so a review shows up on the very next read. */
export class ReviewStore extends DurableObject<Env> {
  fetch(req: Request) {
    return handle(req, { env: this.env, store: this.ctx.storage });
  }
}

export default {
  fetch(req: Request, env: Env) {
    return env.STORE.get(env.STORE.idFromName('global')).fetch(req);
  },
};
