import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qdpfccuqeumguhishifu.supabase.co';
const supabaseKey = 'sb_publishable_7zzt6OS8UGjfFkXVoVw00w_jemILZFT';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = `test_delete_${Math.floor(Math.random() * 1000000)}@example.com`;
  const password = 'TestPassword123!';

  console.log(`Signing up temporary user: ${email}...`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    console.error('Sign up failed:', signUpError);
    return;
  }

  const user = signUpData.user;
  console.log('User signed up successfully. ID:', user?.id);

  try {
    // Wait a brief moment for any trigger logic to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('Creating a personal inquiry...');
    const { data: inquiry, error: createError } = await supabase.rpc('create_personal_inquiry', {
      p_category: 'etc',
      p_title: 'Test Inquiry for Delete',
      p_content: 'This is a test inquiry to verify if deletion works in production.'
    });

    if (createError) {
      console.error('Failed to create personal inquiry:', createError);
      return;
    }

    console.log('Created inquiry:', inquiry);

    console.log(`Attempting to delete inquiry: ${inquiry.id}...`);
    const { data: deleteRes, error: deleteError } = await supabase.rpc('delete_my_personal_inquiry', {
      p_inquiry_id: inquiry.id,
    });

    if (deleteError) {
      console.error('DELETE FAILED WITH ERROR:', deleteError);
    } else {
      console.log('DELETE SUCCESS:', deleteRes);
    }

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    // We can't easily delete the auth user via anon key, but we can sign out.
    await supabase.auth.signOut();
    console.log('Signed out.');
  }
}

run();
