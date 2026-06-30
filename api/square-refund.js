export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { paymentId } = await req.json();

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

    // First, look up the actual payment to get the exact refundable amount from Square itself
    const paymentResp = await fetch(`https://connect.squareup.com/v2/payments/${paymentId}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Square-Version': '2024-01-17'
      }
    });
    const paymentData = await paymentResp.json();

    if (paymentData.errors && paymentData.errors.length > 0) {
      return new Response(JSON.stringify({
        error: paymentData.errors[0].detail || 'Could not look up payment',
        errors: paymentData.errors
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const payment = paymentData.payment;
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use Square's own total_money for the refund amount — guarantees no mismatch
    const amountMoney = payment.total_money;

    if (!amountMoney || !amountMoney.amount) {
      return new Response(JSON.stringify({ error: 'Could not determine refundable amount' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = {
      idempotency_key: paymentId + '-refund-' + Date.now(),
      payment_id: paymentId,
      amount_money: amountMoney,
      reason: 'Customer refund - Tedrow\'s Mobile Detailing'
    };

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
      // Check if it's already refunded — treat as success since the goal is achieved
      const detail = data.errors[0].detail || '';
      if (detail.toLowerCase().includes('already') || detail.toLowerCase().includes('exceeds the amount available')) {
        return new Response(JSON.stringify({
          success: true,
          alreadyRefunded: true,
          message: 'This payment appears to already be refunded.'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: detail || 'Square refund failed',
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
