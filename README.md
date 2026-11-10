# Rate Expectations (Cloudflare Worker `ratings-reviews`)

"Rate Expectations" is a fictional, generic ratings and reviews provider for Storefront Next / SCAPI demos. It isn't tied to any brand: any product ID returns stable sample data.

- **Live API:** https://ratings-reviews.luke-johnson-c65.workers.dev
- **Docs:** https://lukejohnson-sf.github.io/ratings-reviews/ (GitHub Pages from `/docs`)
- **Auth:** `x-api-key` header (Worker secret `API_KEY`; local dev uses `dev-key` from `.dev.vars`)
- **State:** one Durable Object (strongly consistent). Seeds are derived from the productId hash.
- **Chaos:** `?chaos=slow|error|flaky` or the `x-chaos` header

## Rebranding for a demo
Edit `DIMENSIONS`, `SUGGESTED_TOPICS` and `RULES` in `src/seed.ts` (for example change "Size & Fit" to "Scent" for a beauty brand), then run:
```sh
npm run spec      # regenerate docs/openapi.json
npx wrangler deploy
git commit -am "..." && git push   # updates the docs
```

## Talk-track curls
```sh
B=https://ratings-reviews.luke-johnson-c65.workers.dev; K=(-H "x-api-key: $KEY" -H 'content-type: application/json')
curl $K "$B/v1/products/P-1001/reviews?sort=highest&limit=4"   # PDP: summary + reviews
curl $K "$B/v1/summaries?productIds=P-1001,P-1002"              # PLP stars
curl $K $B/v1/form-config                                       # write-a-review form
curl $K -X POST $B/v1/products/P-1001/reviews -d '{"rating":5,"title":"Love it","body":"Great quality, good price, and it still looks new after many uses. Highly recommend!","author":"Abby","location":"Virginia","dimensions":{"fit":3,"comfort":5}}'
curl $K -X POST $B/v1/reset                                     # remove submitted reviews
```
