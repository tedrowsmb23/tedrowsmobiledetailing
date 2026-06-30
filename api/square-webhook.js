export const config = { runtime: 'edge' };

const AIRTABLE_TOKEN = 'pataaV2WO4bTJ9Ei3.9b12449727bf7d6d6eda2b73a1925e7c748e439afaaee5f17e6874433f1ad512';
const BASE_ID = 'apps2Jb1pPgwgn2CH';
const INVOICES_TABLE = 'tbla8c5eQ0NkoQOLm';
const AT_BASE = `https://api.airtable.com/v0/${BASE_ID}`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.text();

    // Verify Square webhook signature
    const webhookKey = process.env.SQUARE_WEBHOOK_KEY;
    const signature = req.headers.get('x-square-hmacsha256-signature');
    const url = 'https://app.tedrowsmobiledetail.com/api/square-webhook';

    if (webhookKey && signature) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookKey);
      const msgData = encoder.encode(url + body);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
      if (sigBase64 !== signature) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const event = JSON.parse(body);

    // Only handle completed payments
    if (event.type !== 'payment.updated') {
      return new Response('OK', { status: 200 });
    }

    const payment = event.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') {
      return new Response('OK - not completed', { status: 200 });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const paidDate = new Date().toISOString().slice(0, 10);

    if (!orderId) {
      return new Response('OK - no order_id', { status: 200 });
    }

    // Find invoice in Airtable by Square Order ID
    const searchUrl = `${AT_BASE}/${INVOICES_TABLE}?filterByFormula=${encodeURIComponent(`{Square Order ID}='${orderId}'`)}`;
    const searchResp = await fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN }
    });
    const searchData = await searchResp.json();

    if (!searchData.records || searchData.records.length === 0) {
      return new Response('OK - no matching invoice for order ' + orderId, { status: 200 });
    }

    const record = searchData.records[0];

    // Only update if not already paid
    if (record.fields['Status'] === 'paid') {
      return new Response('OK - already paid', { status: 200 });
    }

    // Mark invoice paid, save payment ID and date
    await fetch(`${AT_BASE}/${INVOICES_TABLE}/${record.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Status': 'paid',
          'Square Payment ID': paymentId,
          'Paid Date': paidDate,
          'Paid Amount': (payment.total_money?.amount || 0) / 100
        }
      })
    });

    return new Response(JSON.stringify({ 
      success: true, 
      invoice: record.fields['Invoice Number'],
      paymentId,
      orderId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
