// v3
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
    const event = JSON.parse(body);

    console.log('Webhook received:', event.type);

    // Only handle payment.updated
    if (event.type !== 'payment.updated') {
      console.log('Ignoring event type:', event.type);
      return new Response('OK - wrong type', { status: 200 });
    }

    const payment = event.data?.object?.payment;
    console.log('Payment status:', payment?.status);
    console.log('Order ID:', payment?.order_id);

    if (!payment) {
      console.log('No payment object found');
      return new Response('OK - no payment', { status: 200 });
    }

    if (payment.status !== 'COMPLETED') {
      console.log('Payment not completed, status:', payment.status);
      return new Response('OK - not completed', { status: 200 });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const paidDate = new Date().toISOString().slice(0, 10);

    if (!orderId) {
      console.log('No order_id in payment');
      return new Response('OK - no order_id', { status: 200 });
    }

    console.log('Searching Airtable for order:', orderId);

    // Find invoice in Airtable by Square Order ID
    const formula = `{Square Order ID}='${orderId}'`;
    const searchUrl = `${AT_BASE}/${INVOICES_TABLE}?filterByFormula=${encodeURIComponent(formula)}`;
    
    console.log('Search URL:', searchUrl);

    const searchResp = await fetch(searchUrl, {
      headers: { 
        'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const searchData = await searchResp.json();
    console.log('Airtable search result:', JSON.stringify(searchData));

    if (!searchData.records || searchData.records.length === 0) {
      console.log('No matching invoice found for order:', orderId);
      return new Response('OK - no matching invoice for order ' + orderId, { status: 200 });
    }

    const record = searchData.records[0];
    console.log('Found invoice:', record.fields['Invoice Number'], 'current status:', record.fields['Status']);

    if (record.fields['Status'] === 'paid') {
      console.log('Invoice already paid, skipping');
      return new Response('OK - already paid', { status: 200 });
    }

    // Mark invoice paid
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
          'Paid Date': paidDate,
          'Paid Amount': (payment.total_money?.amount || 0) / 100
        }
      })
    });

    const updateData = await updateResp.json();
    console.log('Update result:', JSON.stringify(updateData));

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
    console.log('Error:', e.message, e.stack);
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
