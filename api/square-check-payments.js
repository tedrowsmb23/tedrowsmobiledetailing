export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Square token not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Look back 30 days for completed payments
    const beginTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const resp = await fetch(
      `https://connect.squareup.com/v2/payments?begin_time=${encodeURIComponent(beginTime)}&sort_order=DESC`,
      {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Square-Version': '2024-01-17'
        }
      }
    );

    const data = await resp.json();

    if (data.errors && data.errors.length) {
      return new Response(JSON.stringify({ error: data.errors[0].detail || 'Square API error' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return only completed payments with the fields we need
    const payments = (data.payments || [])
      .filter(p => p.status === 'COMPLETED')
      .map(p => ({
        paymentId: p.id,
        orderId: p.order_id || null,
        amount: (p.total_money?.amount || 0) / 100,
        createdAt: p.created_at
      }));

    return new Response(JSON.stringify({ success: true, payments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
