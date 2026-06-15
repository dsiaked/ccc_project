import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qdpfccuqeumguhishifu.supabase.co';
const supabaseKey = 'sb_publishable_7zzt6OS8UGjfFkXVoVw00w_jemILZFT';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Checking production database...');
  try {
    // 1. Get deployment compatibility version
    const { data: version, error: versionError } = await supabase.rpc('get_deployment_compatibility_version');
    console.log('get_deployment_compatibility_version result:', { version, versionError });

    // 2. Check if assert_deployment_compatibility exists and what it returns for 186
    const { data: assertRes, error: assertError } = await supabase.rpc('assert_deployment_compatibility', { p_required_version: 186 });
    console.log('assert_deployment_compatibility(186) result:', { assertRes, assertError });

    // 3. Check if we can call delete_my_personal_inquiry (we expect it to fail with auth/not found if it exists, or method not found if it does not)
    const { data: deleteRes, error: deleteError } = await supabase.rpc('delete_my_personal_inquiry', { p_inquiry_id: '00000000-0000-0000-0000-000000000000' });
    console.log('delete_my_personal_inquiry result:', { deleteRes, deleteError });

    // 4. Check a non-existent function to compare error messages
    const { data: nonExistentRes, error: nonExistentError } = await supabase.rpc('this_function_does_not_exist_xyz');
    console.log('non_existent_function result:', { nonExistentRes, nonExistentError });

  } catch (err) {
    console.error('Error in script:', err);
  }
}

run();
