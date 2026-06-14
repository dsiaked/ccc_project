-- Restore the exact ACL state after objects inherit Supabase defaults.

-- Re-create missing functions from previous baselined migrations if they don't exist on remote DB
CREATE OR REPLACE FUNCTION public.prune_allocation_optimization_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  WITH RECURSIVE retained_jobs(id) AS (
    SELECT job.id
    FROM public.allocation_optimization_jobs job
    WHERE job.requested_at >= now() - interval '90 days'
      OR job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')

    UNION

    SELECT recent_optimal.id
    FROM (
      SELECT job.id
      FROM public.allocation_optimization_jobs job
      WHERE job.status = 'OPTIMAL'
      ORDER BY job.completed_at DESC NULLS LAST, job.requested_at DESC, job.id
      LIMIT 5
    ) recent_optimal

    UNION

    SELECT dependency.id
    FROM retained_jobs retained
    JOIN public.allocation_optimization_jobs retained_job
      ON retained_job.id = retained.id
    JOIN public.allocation_optimization_jobs dependency
      ON dependency.id in (
        retained_job.source_job_id,
        retained_job.resume_from_job_id
      )
  ),
  deleted as (
    DELETE FROM public.allocation_optimization_jobs job
    WHERE job.id not in (SELECT retained.id FROM retained_jobs retained)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted_count FROM deleted;

  RETURN v_deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_allocation_optimization_jobs_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.prune_allocation_optimization_jobs();
  RETURN null;
END;
$$;

DROP TRIGGER IF EXISTS prune_allocation_optimization_jobs_after_insert ON public.allocation_optimization_jobs;
CREATE TRIGGER prune_allocation_optimization_jobs_after_insert
AFTER INSERT ON public.allocation_optimization_jobs
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_allocation_optimization_jobs_after_insert();

CREATE OR REPLACE FUNCTION public.prune_activity_event_logs_daily()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_pruned_on date;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('activity_event_logs_retention')) THEN
    RETURN null;
  END IF;

  SELECT nullif(value ->> 'last_pruned_on', '')::date
  INTO v_last_pruned_on
  FROM public.app_settings
  WHERE key = 'activity_event_log_retention';

  IF v_last_pruned_on IS NOT NULL AND v_last_pruned_on >= current_date THEN
    RETURN null;
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (
    'activity_event_log_retention',
    jsonb_build_object('last_pruned_on', current_date),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = excluded.value,
    updated_at = excluded.updated_at;

  PERFORM public.prune_activity_event_logs();
  RETURN null;
END;
$$;

DROP TRIGGER IF EXISTS prune_activity_event_logs_daily ON public.activity_event_logs;
CREATE TRIGGER prune_activity_event_logs_daily
AFTER INSERT ON public.activity_event_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_activity_event_logs_daily();

REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
REVOKE ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON TABLE "public"."personal_inquiry_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."personal_inquiry_messages" TO "authenticated";
REVOKE ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."assert_allocation_planning_unlocked"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_allocation_planning_unlocked"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";
REVOKE ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."audit_admin_operation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_admin_operation"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."audit_business_activity_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_business_activity_event"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."audit_campus_request_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_campus_request_change"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."audit_campus_request_message_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_campus_request_message_change"() TO "service_role";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "service_role";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campus_transfers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campus_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_transfers" TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_allocations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."bus_allocations" TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."confirm_my_boarding"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_my_boarding"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_allocation_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campuses" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campuses" TO "authenticated";
GRANT ALL ON TABLE "public"."campuses" TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") TO "service_role";
GRANT ALL ON TABLE "public"."campus_requests" TO "anon";
GRANT ALL ON TABLE "public"."campus_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_requests" TO "service_role";
GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."home_announcements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."home_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."home_announcements" TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON TABLE "public"."personal_inquiries" TO "service_role";
GRANT SELECT ON TABLE "public"."personal_inquiries" TO "authenticated";
REVOKE ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_uncached_allocation_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_uncached_allocation_optimization_job"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_user_reservation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_reservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_reservation"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_user_reservation_without_opening_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_reservation_without_opening_check"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."email_exists"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "service_role";
GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_active_reservation_optimization_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_reservation_optimization_state"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_allocation_optimizer_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_optimizer_config"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_optimizer_config"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_available_remaining_seats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_management_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_management_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_management_snapshot"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_campus_request_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_request_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_request_summary"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_deletable_user_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_deployment_compatibility_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_destination_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_destination_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_destination_stats"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_draft_allocation_summaries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_draft_allocation_summaries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_draft_allocation_summaries"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_admin_roles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_admin_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_admin_roles"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_personal_inquiries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiries"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_operation_closeout"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operation_closeout"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operation_closeout"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") TO "service_role";
GRANT ALL ON TABLE "public"."personal_inquiry_audit_logs" TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_public_contact_info"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_unread_campus_request_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_campus_request_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_campus_request_ids"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."initialize_reservation_normalized_storage"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_reservation_normalized_storage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_reservation_normalized_storage"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_boarding_manager"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_boarding_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_boarding_manager"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_global_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_allocation_job_result_reused"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_allocation_job_result_reused"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "service_role";
GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_bus_departures" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_bus_departures" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_bus_departures" TO "service_role";
REVOKE ALL ON FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_allocation_cancel_after_departure"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_allocation_cancel_after_departure"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_reservation_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_reservation_changes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_walk_in_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_walk_in_changes"() TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prune_activity_event_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_activity_event_logs"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prune_activity_event_logs_daily"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_activity_event_logs_daily"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prune_allocation_optimization_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_optimization_jobs"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() TO "service_role";
GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "service_role";
GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_user_reservation_as_admin"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_user_reservation_as_admin"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_user_reservation_as_admin"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_allocation_optimization_job_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_allocation_optimization_job_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "service_role";
GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_personal_user_organization_v2"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_affiliation_type" "text", "p_campus_id" "uuid", "p_district" "text", "p_campus" "text", "p_coordinator_name" "text", "p_coordinator_phone" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_organization_v2"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_affiliation_type" "text", "p_campus_id" "uuid", "p_district" "text", "p_campus" "text", "p_coordinator_name" "text", "p_coordinator_phone" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_organization_v2"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_affiliation_type" "text", "p_campus_id" "uuid", "p_district" "text", "p_campus" "text", "p_coordinator_name" "text", "p_coordinator_phone" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_personal_user_staff_status"("p_target_user_id" "uuid", "p_is_staff" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_staff_status"("p_target_user_id" "uuid", "p_is_staff" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_staff_status"("p_target_user_id" "uuid", "p_is_staff" boolean, "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_options" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_options" TO "authenticated";
GRANT ALL ON TABLE "public"."bus_options" TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_allocation_bus_identifiers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_bus_identifiers"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() TO "service_role";
GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "service_role";
GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "service_role";
GRANT ALL ON TABLE "public"."activity_event_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_event_logs" TO "service_role";
GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_invitation_codes" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_invitation_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_invitation_codes" TO "service_role";
GRANT ALL ON TABLE "public"."ai_operations_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_operations_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_operations_reports" TO "service_role";
GRANT ALL ON TABLE "public"."allocation_optimization_events" TO "service_role";
GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."allocation_optimization_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."allocation_workspace_versions" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_check_in_attempts" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_check_in_codes" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_exception_archives" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_exception_reason_edit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_exception_reason_edits" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_manager_bus_assignments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_manager_bus_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_manager_bus_assignments" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_move_requests" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_status_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_status_events" TO "service_role";
GRANT ALL ON TABLE "public"."boarding_walk_in_passengers" TO "service_role";
GRANT ALL ON TABLE "public"."campus_notice_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_notice_reads" TO "service_role";
GRANT ALL ON TABLE "public"."campus_notice_targets" TO "anon";
GRANT ALL ON TABLE "public"."campus_notice_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_notice_targets" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."districts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."districts" TO "authenticated";
GRANT ALL ON TABLE "public"."districts" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teams" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";
GRANT ALL ON TABLE "public"."campus_options" TO "anon";
GRANT ALL ON TABLE "public"."campus_options" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_options" TO "service_role";
GRANT ALL ON TABLE "public"."campus_payment_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."campus_request_messages" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_messages" TO "service_role";
GRANT ALL ON TABLE "public"."campus_request_reads" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_reads" TO "service_role";
GRANT ALL ON TABLE "public"."ccc_summer_campus_mappings" TO "service_role";
GRANT ALL ON TABLE "public"."ccc_summer_user_links" TO "service_role";
GRANT ALL ON TABLE "public"."manual_boarding_exception_records" TO "service_role";
GRANT ALL ON TABLE "public"."personal_inquiry_reads" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_notifications" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_user_action_logs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_user_action_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_user_action_logs" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."simulation_stage_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."simulation_stage_runs" TO "service_role";
