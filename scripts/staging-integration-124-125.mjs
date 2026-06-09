import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProjectId = process.env.VITE_SIMULATION_PROJECT_ID;

if (!url || !anonKey || !serviceRoleKey || !expectedProjectId) {
  throw new Error(
    'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and VITE_SIMULATION_PROJECT_ID are required.'
  );
}

const projectId = new URL(url).hostname.split('.')[0];
if (projectId !== expectedProjectId) {
  throw new Error(
    `Refusing to run against ${projectId}; expected staging project ${expectedProjectId}.`
  );
}

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};
const service = createClient(url, serviceRoleKey, clientOptions);
const createUserClient = () => createClient(url, anonKey, clientOptions);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Stage-${runId}-A1!`;
const district = `IT district ${runId}`;
const team = `IT team ${runId}`;
const campus = `IT campus ${runId}`;
const created = {
  districtId: null,
  teamId: null,
  campusId: null,
  requestId: null,
  reservationId: null,
  userIds: [],
};

const requireData = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  assert.notEqual(result.data, null, `${label}: expected data`);
  return result.data;
};

const expectRpcError = async (promise, expectedMessage) => {
  const { error } = await promise;
  assert.ok(error, `Expected RPC error containing "${expectedMessage}"`);
  assert.match(error.message, new RegExp(expectedMessage, 'i'));
};

const createAuthUser = async (label, scope = {}) => {
  const email = `${label}-${runId}@example.test`;
  const data = requireData(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: label,
        phone: '010-0000-0000',
        ...scope,
      },
    }),
    `create ${label} auth user`
  );
  created.userIds.push(data.user.id);
  return { id: data.user.id, email };
};

const signIn = async (user) => {
  const client = createUserClient();
  requireData(
    await client.auth.signInWithPassword({
      email: user.email,
      password,
    }),
    `sign in ${user.email}`
  );
  return client;
};

const cleanup = async () => {
  const attempts = [];
  const remove = async (label, promise) => {
    const { error } = await promise;
    if (error) attempts.push(`${label}: ${error.message}`);
  };

  if (created.requestId) {
    await remove(
      'delete request',
      service.from('campus_requests').delete().eq('id', created.requestId)
    );
  }
  if (created.reservationId) {
    await remove(
      'delete reservation',
      service.from('reservations').delete().eq('id', created.reservationId)
    );
  }
  await remove(
    'delete transfer',
    service
      .from('campus_transfers')
      .delete()
      .eq('district', district)
      .eq('team', team)
      .eq('campus', campus)
  );
  for (const userId of created.userIds) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) attempts.push(`delete auth user ${userId}: ${error.message}`);
  }
  if (created.districtId) {
    await remove(
      'delete organization',
      service.from('districts').delete().eq('id', created.districtId)
    );
  }

  if (attempts.length > 0) {
    throw new Error(`Cleanup failed:\n${attempts.join('\n')}`);
  }

  console.log('PASS cleanup: campus request cascade deletion removed test data');
};

const cleanupStaleIntegrationData = async () => {
  const staleDistricts = requireData(
    await service.from('districts').select('id').ilike('name', 'IT district %'),
    'find stale integration districts'
  );

  for (const staleDistrict of staleDistricts) {
    requireData(
      await service
        .from('campus_requests')
        .delete()
        .eq('district_id', staleDistrict.id)
        .select('id'),
      'delete stale integration requests'
    );
    requireData(
      await service
        .from('campus_transfers')
        .delete()
        .eq('district_id', staleDistrict.id)
        .select('id'),
      'delete stale integration transfers'
    );
    requireData(
      await service
        .from('districts')
        .delete()
        .eq('id', staleDistrict.id)
        .select('id'),
      'delete stale integration organization'
    );
  }
};

try {
  await cleanupStaleIntegrationData();

  const districtRow = requireData(
    await service
      .from('districts')
      .insert({ name: district })
      .select('id')
      .single(),
    'create district'
  );
  created.districtId = districtRow.id;

  const teamRow = requireData(
    await service
      .from('teams')
      .insert({ district_id: districtRow.id, name: team })
      .select('id')
      .single(),
    'create team'
  );
  created.teamId = teamRow.id;

  const campusRow = requireData(
    await service
      .from('campuses')
      .insert({ team_id: teamRow.id, name: campus })
      .select('id')
      .single(),
    'create campus'
  );
  created.campusId = campusRow.id;

  const scope = {
    district_id: districtRow.id,
    district,
    team_id: teamRow.id,
    team,
    campus_id: campusRow.id,
    campus,
  };
  const campusAdmin = await createAuthUser('campus-admin', scope);
  const globalAdmin = await createAuthUser('global-admin');
  const passenger = await createAuthUser('passenger', scope);

  requireData(
    await service
      .from('admin_roles')
      .insert([
        {
          user_id: globalAdmin.id,
          role: 'global_admin',
          granted_by: globalAdmin.id,
        },
        {
          user_id: campusAdmin.id,
          role: 'campus_admin',
          ...scope,
          granted_by: globalAdmin.id,
        },
      ])
      .select('id'),
    'create admin roles'
  );

  const campusClient = await signIn(campusAdmin);
  const globalClient = await signIn(globalAdmin);

  const requestResult = requireData(
    await campusClient.rpc('create_campus_request_with_message', {
      p_type: 'etc',
      p_title: `Integration request ${runId}`,
      p_content: 'Initial message must remain immutable.',
      p_district: district,
      p_team: team,
      p_campus: campus,
    }),
    'create campus request'
  );
  created.requestId = requestResult.request.id;
  const initialMessageId = requestResult.message.id;

  const secondMessage = requireData(
    await campusClient
      .from('campus_request_messages')
      .insert({
        request_id: created.requestId,
        sender_id: campusAdmin.id,
        sender_role: 'campus_admin',
        message: 'Editable follow-up message.',
      })
      .select('id, message')
      .single(),
    'create follow-up message'
  );

  const initialUpdate = await campusClient
    .from('campus_request_messages')
    .update({ message: 'This update must be blocked.' })
    .eq('id', initialMessageId)
    .select('id');
  assert.ifError(initialUpdate.error);
  assert.deepEqual(initialUpdate.data, []);

  const initialDelete = await campusClient
    .from('campus_request_messages')
    .delete()
    .eq('id', initialMessageId)
    .select('id');
  assert.ifError(initialDelete.error);
  assert.deepEqual(initialDelete.data, []);

  const initialAfterAttempts = requireData(
    await service
      .from('campus_request_messages')
      .select('message')
      .eq('id', initialMessageId)
      .single(),
    'verify initial message'
  );
  assert.equal(initialAfterAttempts.message, 'Initial message must remain immutable.');

  const updatedFollowUp = requireData(
    await campusClient
      .from('campus_request_messages')
      .update({ message: 'Edited follow-up message.' })
      .eq('id', secondMessage.id)
      .select('id, message')
      .single(),
    'update follow-up message'
  );
  assert.equal(updatedFollowUp.message, 'Edited follow-up message.');
  requireData(
    await campusClient
      .from('campus_request_messages')
      .delete()
      .eq('id', secondMessage.id)
      .select('id')
      .single(),
    'delete follow-up message'
  );
  console.log('PASS migration 124: initial message protected; follow-up edit/delete allowed');

  const reservation = requireData(
    await service
      .from('reservations')
      .insert({
        user_id: passenger.id,
        name: 'Integration passenger',
        phone: '010-0000-0000',
        ...scope,
        station_preferences: [],
        status: 'requested',
        data: {
          name: 'Integration passenger',
          phone: '010-0000-0000',
          district,
          team,
          campus,
          affiliationType: 'seoul',
          stationPreferences: [],
          status: 'requested',
        },
      })
      .select('id')
      .single(),
    'create reservation'
  );
  created.reservationId = reservation.id;

  const ticketPrice = Number(
    requireData(await service.rpc('get_bus_ticket_price'), 'get ticket price')
  );
  requireData(
    await service
      .from('payments')
      .insert({
        user_id: passenger.id,
        reservation_id: reservation.id,
        amount: ticketPrice,
        status: 'completed',
        paid_at: new Date().toISOString(),
      })
      .select('id'),
    'create completed payment'
  );

  const reportParams = {
    p_district: district,
    p_team: team,
    p_campus: campus,
    p_total_people: 1,
    p_paid_people: 1,
    p_total_amount: ticketPrice,
    p_sent_by: globalAdmin.id,
  };
  await expectRpcError(
    campusClient.rpc('mark_campus_transfer_sent', {
      ...reportParams,
      p_total_amount: ticketPrice + 1,
    }),
    'totals changed'
  );

  const transfer = requireData(
    await campusClient.rpc('mark_campus_transfer_sent', reportParams),
    'report campus transfer'
  );
  assert.equal(transfer.status, 'sent');
  assert.equal(transfer.total_people, 1);
  assert.equal(transfer.total_amount, ticketPrice);
  assert.equal(transfer.sent_by, campusAdmin.id);

  const confirmed = requireData(
    await globalClient.rpc('confirm_campus_transfer_amount', {
      p_transfer_id: transfer.id,
      p_confirmed_by: campusAdmin.id,
      p_actual_confirmed_amount: ticketPrice,
    }),
    'confirm campus transfer'
  );
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmed_by, globalAdmin.id);

  await expectRpcError(
    campusClient.rpc('mark_campus_transfer_sent', reportParams),
    'additional settlement'
  );
  console.log(
    'PASS migration 125: totals validated; confirmed transfer overwrite blocked'
  );
} finally {
  await cleanup();
}
