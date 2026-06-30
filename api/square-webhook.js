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
    
    // Only handle payment.updated where payment is COMPLETED
    if (event.type !== 'payment.updated') {
      return new Response('OK', { status: 200 });
    }

    const payment = event.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') {
      return new Response('OK', { status: 200 });
    }

    const paymentId = payment.id;
    const amountCents = payment.total_money?.amount || 0;
    const note = payment.note || '';

    // Extract invoice number from the payment note (format: "INV-001 — Tedrow's Mobile Detailing")
    const invMatch = note.match(/INV-\d+/);
    if (!invMatch) {
      return new Response('OK - no invoice number in note', { status: 200 });
    }
    const invoiceNumber = invMatch[0];

    // Find the invoice in Airtable by Invoice Number
    const searchUrl = `${AT_BASE}/${INVOICES_TABLE}?filterByFormula=${encodeURIComponent(`{Invoice Number}='${invoiceNumber}'`)}`;
    const searchResp = await fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN }
    });
    const searchData = await searchResp.json();
    
    if (!searchData.records || searchData.records.length === 0) {
      return new Response('Invoice not found', { status: 200 });
    }

    const record = searchData.records[0];
    
    // Update invoice: mark paid, save transaction ID and payment date
    const updateResp = await fetch(`${AT_BASE}/${INVOICES_TABLE}/${record.id}`, {
      method: 'PATCH',
      headers: { 
        'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Status': 'paid',
          'Square Payment ID': paymentId,
          'Paid Date': new Date().toISOString().slice(0, 10),
          'Paid Amount': amountCents / 100
        }
      })
    });

    if (!updateResp.ok) {
      const err = await updateResp.text();
      return new Response('Airtable update failed: ' + err, { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, invoice: invoiceNumber, paymentId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
