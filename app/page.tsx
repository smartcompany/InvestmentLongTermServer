export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Investment Calculator API</h1>
      <p>This is a Next.js API server for the InvestLongTerm app.</p>
      
      <h2>API Endpoint</h2>
      <code>POST /api/calculate</code>
      
      <h3>Request Body:</h3>
      <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
{`{
  "asset": "bitcoin" | "tesla",
  "yearsAgo": 1-10,
  "amount": number,
  "type": "single" | "recurring",
  "frequency": "monthly" | "weekly"
}`}
      </pre>
      
      <h3>Response:</h3>
      <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
{`{
  "totalInvested": number,
  "finalValue": number,
  "cagr": number,
  "yieldRate": number,
  "investedSpots": [{"x": number, "y": number}],
  "valueSpots": [{"x": number, "y": number}]
}`}
      </pre>
    </div>
  );
}
