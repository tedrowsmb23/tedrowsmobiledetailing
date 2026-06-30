export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { paymentId, amount } = await req.json();

    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Missing paymentId' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Square token not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Amount in cents — full refund
    const amountCents = Math.round((amount || 0) * 100);

    const body = {
      idempotency_key: paymentId + '-refund-' + Date.now(),
      payment_id: paymentId,
      reason: 'Customer refund - Tedrow\'s Mobile Detailing'
    };

    // If amount provided, do partial — but we're doing full refunds so omit amount_money
    // Square will refund the full amount if amount_money is omitted
    if (amountCents > 0) {
      body.amount_money = { amount: amountCents, currency: 'USD' };
    }

    const resp = await fetch('https://connect.squareup.com/v2/refunds', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-17'
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json();

    if (data.errors && data.errors.length > 0) {
      return new Response(JSON.stringify({ 
        error: data.errors[0].detail || 'Square refund failed',
        errors: data.errors
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      refund: data.refund 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
