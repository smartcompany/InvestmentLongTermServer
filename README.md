# InvestLongTerm Server

Next.js API server for the InvestLongTerm Flutter app.

## Features

- Fetches real historical price data for Bitcoin (CoinGecko API) and Tesla (Yahoo Finance API)
- Calculates investment returns using real price data
- Supports both single (lump sum) and recurring (DCA) investment strategies
- In-memory caching to reduce API calls
- CORS enabled for Flutter app integration

## API Endpoint

### POST /api/calculate

Calculate investment returns based on historical price data.

**Request Body:**
```json
{
  "asset": "bitcoin" | "tesla",
  "yearsAgo": 1-10,
  "amount": number,
  "type": "single" | "recurring",
  "frequency": "monthly" | "weekly"
}
```

**Response:**
```json
{
  "totalInvested": number,
  "finalValue": number,
  "cagr": number,
  "yieldRate": number,
  "investedSpots": [{"x": number, "y": number}],
  "valueSpots": [{"x": number, "y": number}]
}
```

## Development

```bash
npm install
npm run dev
```

Server will run on http://localhost:3000

## Deployment

Deploy to Vercel:

```bash
vercel
```

## Environment Variables

No environment variables required. APIs used are public and don't require authentication.
