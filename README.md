# Criterio

AI-generated industry research. Human-validated intelligence.

**Live site:** https://criterio.in-kluso.com  
**Staging:** https://criterio-3mc.pages.dev

## Structure

```
criterio/
├── index.html                    ← Homepage (all 30 signals)
├── about/index.html
├── register/index.html
├── real-estate/
│   ├── index.html               ← Vertical index
│   └── [slug]/index.html        ← 10 articles
├── retail/
│   ├── index.html
│   └── [slug]/index.html
├── brand/
│   ├── index.html
│   └── [slug]/index.html
└── functions/
    └── api/
        └── validate.js          ← Cloudflare Pages Function (Anthropic proxy)
```

## Validation Levels

| Level | Color | Label |
|-------|-------|-------|
| LV0 | Gray `#8A8578` | UNVALIDATED |
| LV1 | Blue `#2D6BE4` | VALIDATED |
| LV2 | Green `#2E9B6F` | DOUBLE-VALIDATED |
| LV3 | Gold `#C9A84C` | GOLD STANDARD |

## Vertical Colors

| Vertical | Color |
|----------|-------|
| Real Estate | `#2D6BE4` |
| Retail | `#C4317A` |
| Brand | `#E8602C` |

## Deployment

```bash
CLOUDFLARE_API_TOKEN=YQAkpu8Lkc51NDubB9PhwXmRTi-BTAUGVD3jx7gD \
  npx wrangler pages deploy . --project-name=criterio --branch=main
```

## Worker Setup (one-time)

The `/api/validate` function requires an `ANTHROPIC_API_KEY` environment variable.  
Set it in Cloudflare Dashboard → Pages → criterio → Settings → Environment Variables.

## Part of IN·KluSo

INKLUSO, Inc. · XTATIK LLC
