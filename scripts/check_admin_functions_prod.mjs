import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qdpfccuqeumguhishifu.supabase.co';
const supabaseKey = 'sb_publishable_7zzt6OS8UGjfFkXVoVw00w_jemILZFT';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Checking production database admin functions...');
  try {
    // 1. Check delete_personal_inquiry_as_global_admin
    const { data: delPersRes, error: delPersError } = await supabase.rpc('delete_personal_inquiry_as_global_admin', { p_inquiry_id: '00000000-0000-0000-0000-000000000000' });
    console.log('delete_personal_inquiry_as_global_admin result:', { delPersRes, delPersError });

    // 2. Check delete_campus_request_as_global_admin
    const { data: delCampRes, error: delCampError } = await supabase.rpc('delete_campus_request_as_global_admin', { p_request_id: '00000000-0000-0000-0000-000000000000' });
    console.log('delete_campus_request_as_global_admin result:', { delCampRes, delCampError });

  } catch (err) {
    console.error('Error in script:', err);
  }
}

run();
