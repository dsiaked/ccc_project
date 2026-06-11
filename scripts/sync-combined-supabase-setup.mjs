import { readFileSync, writeFileSync } from 'node:fs';

const combinedPath = 'sql/setup/combined_supabase_setup.sql';
const setupFiles = [
  '70_admin_personal_ticket_page.sql',
  '71_admin_setup_rpc_only_writes.sql',
  '72_app_settings_announcements_rpc_only.sql',
  '73_campus_transfers_rpc_only_writes.sql',
  '74_bus_allocations_rpc_only_writes.sql',
  '75_campus_admin_manage_users_page.sql',
  '76_exact_allocation_optimization_jobs.sql',
  '77_create_draft_from_exact_optimization.sql',
  '78_out_of_preference_admin_override.sql',
  '79_single_bus_option.sql',
  '80_notice_audience_and_lifecycle.sql',
  '80_remaining_seat_payment_workflow.sql',
  '80_detailed_allocation_optimization_jobs.sql',
  '81_immediate_allocation_job_cancel.sql',
  '84_instant_allocation_result_reuse.sql',
  '85_passenger_boarding_confirmation.sql',
  '85_allocation_result_reuse_status.sql',
  '86_detailed_allocation_resume_and_skip.sql',
  '87_boarding_management.sql',
  '88_allocation_requires_closed_deadline.sql',
  '89_allocation_execution_mode.sql',
  '91_atomic_campus_request_workflow.sql',
  '92_admin_created_account_source.sql',
  '92_campus_request_read_and_audit.sql',
  '93_reset_allocation_optimization_jobs.sql',
  '94_boarding_notes.sql',
  '95_admin_permission_and_audit.sql',
  '96_boarding_manager_bus_assignments.sql',
  '97_campus_payment_accounts.sql',
  '98_boarding_check_in_codes.sql',
  '99_external_participants.sql',
  '100_four_digit_boarding_check_in_codes.sql',
  '101_disable_public_email_exists.sql',
  '102_invalidate_optimization_cache_on_reservation_changes.sql',
  '103_show_reservation_changes_on_optimization_jobs.sql',
  '104_remaining_seat_allocation_passenger_source.sql',
  '105_lock_allocation_planning_while_confirmed.sql',
  '106_canonical_boarding_bus_id.sql',
  '107_fix_confirmed_allocation_name.sql',
  '108_enforce_optimizer_maximum_bus_count.sql',
  '109_canonical_reservation_data.sql',
  '110_canonical_reservation_organization_scope.sql',
  '111_classify_automatic_boarding_events.sql',
  '112_canonical_profile_organization_scope.sql',
  '113_canonical_admin_role_organization_scope.sql',
  '114_allow_allocation_workspace_lock_before_deadline.sql',
  '115_canonical_campus_request_organization_scope.sql',
  '116_campus_admin_payment_account.sql',
  '117_cancel_campus_transfer_report.sql',
  '118_prioritize_campus_admin_in_search.sql',
  '119_allow_confirmation_transaction_cleanup.sql',
  '120_search_all_users_for_campus_admin.sql',
  '121_fix_campus_payment_account_campus_id_ambiguity.sql',
  '122_fix_campus_admin_search_rpc_access.sql',
  '123_avoid_confirmation_table_lock_timeout.sql',
  '124_protect_initial_campus_request_message.sql',
  '125_secure_campus_transfer_reports.sql',
  '126_allow_campus_request_cascade_delete.sql',
  '127_keyset_pagination_indexes.sql',
  '128_admin_audit_log_keyset_index.sql',
  '129_campus_transfer_reports_require_closed_deadline.sql',
  '130_personal_ticket_district_filter.sql',
  '131_return_complete_optimizer_config_after_save.sql',
  '132_performance_lookup_indexes.sql',
  '133_prevent_stale_optimizer_result_reuse.sql',
  '134_safe_reset_allocation_optimization_jobs.sql',
  '135_split_allocation_deadline_triggers.sql',
  '136_allow_external_reservations_without_team.sql',
  '137_enable_signup_email_availability_check.sql',
  '138_admin_invitation_codes.sql',
  '139_fix_allocation_draft_reservation_normalization.sql',
  '140_boarding_field_exceptions.sql',
  '142_bulk_admin_invitation_codes.sql',
  '143_fix_allocation_optimization_reset.sql',
  '144_expire_stale_allocation_optimization_jobs.sql',
  '145_fix_invitation_code_pgcrypto_search_path.sql',
  '146_rate_limit_boarding_check_in_codes.sql',
  '147_personal_user_management.sql',
  '147_secure_admin_created_account_source.sql',
  '148_store_invitation_code_plaintext.sql',
  '149_disable_signup_email_enumeration.sql',
  '150_require_boarding_transition_reason.sql',
  '151_personal_user_management_enhancements.sql',
  '152_fix_boarding_station_preferences.sql',
  '153_boarding_move_requests.sql',
  '154_boarding_exception_archives.sql',
  '155_boarding_exception_reason_edits.sql',
  '156_ai_operations_reports.sql',
  '157_ccc_summer_user_links.sql',
  '158_allow_allocation_confirmation_cancel_before_deadline.sql',
  '159_personal_notification_audit_reasons.sql',
  '160_manual_boarding_exception_records.sql',
  '161_diagnose_allocation_optimization_reset.sql',
  '162_ccc_summer_campus_mapping.sql',
  '163_fix_guarded_allocation_optimization_reset.sql',
  '164_extend_allocation_confirmation_timeout.sql',
  '165_lock_departed_bus_boarding_edits.sql',
  '166_operation_closeout.sql',
];

let combined = readFileSync(combinedPath, 'utf8').replaceAll('\r\n', '\n');
const separator = '-- =========================================================';
const sections = [];

for (const setupFile of setupFiles) {
  const beginMarker = `-- BEGIN sql/setup/${setupFile}`;
  const endMarker = `-- END sql/setup/${setupFile}`;
  const sql = readFileSync(`sql/setup/${setupFile}`, 'utf8')
    .replaceAll('\r\n', '\n')
    .trimEnd();
  sections.push(
    `${separator}\n${beginMarker}\n${separator}\n\n${sql}\n\n${separator}\n${endMarker}\n${separator}`
  );
  const start = combined.indexOf(beginMarker);
  const end = combined.indexOf(endMarker);

  if (start < 0 && end < 0) continue;
  if (start < 0 || end < start) {
    throw new Error(`Malformed combined setup markers for ${setupFile}.`);
  }

  const sectionStart = combined.lastIndexOf(separator, start);
  const trailingSeparator = combined.indexOf(separator, end);
  if (sectionStart < 0 || trailingSeparator < 0) {
    throw new Error(`Missing combined setup separator for ${setupFile}.`);
  }
  const sectionEnd = trailingSeparator + separator.length;
  combined = `${combined.slice(0, sectionStart)}${combined.slice(sectionEnd)}`;
}

combined = `${combined.trimEnd()}\n\n${sections.join('\n\n')}\n`;
writeFileSync(combinedPath, combined);
