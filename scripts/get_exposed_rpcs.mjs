const supabaseUrl = 'https://qdpfccuqeumguhishifu.supabase.co';
const anonKey = 'sb_publishable_7zzt6OS8UGjfFkXVoVw00w_jemILZFT';

async function run() {
  console.log('Fetching OpenAPI schema from production Supabase...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const doc = await response.json();
    const paths = Object.keys(doc.paths || {});
    console.log('Total paths found:', paths.length);
    
    console.log('RPCs starting with /rpc/delete:');
    const deleteRpcs = paths.filter(p => p.startsWith('/rpc/delete') || p.includes('delete'));
    console.log(deleteRpcs);

    console.log('RPCs starting with /rpc/get_my:');
    const getMyRpcs = paths.filter(p => p.startsWith('/rpc/get_my'));
    console.log(getMyRpcs);
    
  } catch (err) {
    console.error('Error fetching OpenAPI schema:', err);
  }
}

run();
