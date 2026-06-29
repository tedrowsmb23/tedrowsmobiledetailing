export const config = { runtime: 'edge' };

export default async function handler(req) {
  const AT_TOKEN = 'pataaV2WO4bTJ9Ei3.9b12449727bf7d6d6eda2b73a1925e7c748e439afaaee5f17e6874433f1ad512';
  const BASE_ID = 'apps2Jb1pPgwgn2CH';
  const CUSTOMERS_TABLE = 'tblumv14VgGeHurO2';

  try {
    const body = await req.json();
    const f = body.fields || {};

    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CUSTOMERS_TABLE}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'Full Name': f['Full Name'] || '',
            'Phone': f['Phone'] || '',
            'Vehicle': f['Vehicle'] || '',
            'Address': f['Address'] || '',
            'Notes': f['Notes'] || ''
          }
        }]
      })
    });

    const text = await response.text();
    
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }

    if (!response.ok || data.error) {
      return new Response(JSON.stringify({ success: false, error: data.error || text, status: response.status }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message, stack: err.stack }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
