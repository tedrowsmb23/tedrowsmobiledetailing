export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const AT_TOKEN = 'pataaV2WO4bTJ9Ei3.9b12449727bf7d6d6eda2b73a1925e7c748e439afaaee5f17e6874433f1ad512';
  const BASE_ID = 'apps2Jb1pPgwgn2CH';
  const CUSTOMERS_TABLE = 'tblumv14VgGeHurO2';

  try {
    const body = await req.json();
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CUSTOMERS_TABLE}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [{ fields: body.fields }] })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
