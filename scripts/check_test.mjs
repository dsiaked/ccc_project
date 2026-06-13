import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pjbvxoesgwhbxfsfjliw.supabase.co';
const supabaseKey = 'sb_publishable_wHnYc8c8PzLLiOe6mqU33Q_ix2unthx';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Checking development database...');
  try {
    // 1. Get deployment compatibility version
    const { data: version, error: versionError } = await supabase.rpc('get_deployment_compatibility_version');
    console.log('get_deployment_compatibility_version result:', { version, versionError });

    // 2. Check assert_deployment_compatibility
    const { data: assertRes, error: assertError } = await supabase.rpc('assert_deployment_compatibility', { p_required_version: 186 });
    console.log('assert_deployment_compatibility(186) result:', { assertRes, assertError });

    // 3. Check delete_my_personal_inquiry
    const { data: deleteRes, error: deleteError } = await supabase.rpc('delete_my_personal_inquiry', { p_inquiry_id: '00000000-0000-0000-0000-000000000000' });
    console.log('delete_my_personal_inquiry result:', { deleteRes, deleteError });

  } catch (err) {
    console.error('Error in script:', err);
  }
}

run();
