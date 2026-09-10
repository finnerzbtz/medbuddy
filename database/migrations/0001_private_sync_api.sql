-- Only the managed identity owner may access their data. Account deletion cascades.
ALTER TABLE public.reminduh_accounts ADD CONSTRAINT reminduh_auth_owner FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.reminduh_check_ins ADD CONSTRAINT valid_check_in_status CHECK (status IN ('taken', 'skipped'));
ALTER TABLE public.reminduh_accounts ADD CONSTRAINT positive_revision CHECK (revision >= 0);
--> statement-breakpoint
CREATE FUNCTION public.reminduh_uid() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.user_id()::uuid;
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM neon_auth."user" WHERE id = uid AND "emailVerified" = true AND coalesce(banned, false) = false) THEN
    RAISE EXCEPTION 'Sign in with a verified email to continue.' USING ERRCODE = '28000';
  END IF;
  RETURN uid;
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_uid() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.reminduh_read() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public.reminduh_uid(); account public.reminduh_accounts%ROWTYPE;
BEGIN
  SELECT * INTO account FROM public.reminduh_accounts WHERE user_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('revision', 0, 'data', NULL, 'updatedAt', NULL); END IF;
  RETURN jsonb_build_object('revision', account.revision, 'updatedAt', account.updated_at,
    'data', account.settings || jsonb_build_object(
      'medications', coalesce((SELECT jsonb_agg(details ORDER BY details->>'createdAt', id) FROM public.reminduh_medications WHERE user_id = uid), '[]'::jsonb),
      'records', coalesce((SELECT jsonb_object_agg(id, details) FROM public.reminduh_check_ins WHERE user_id = uid), '{}'::jsonb),
      'updatedAt', account.updated_at));
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminduh_read() TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.reminduh_save(expected_revision bigint, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public.reminduh_uid(); current_revision bigint; med jsonb; item record; doc jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT revision INTO current_revision FROM public.reminduh_accounts WHERE user_id = uid FOR UPDATE;
  current_revision := coalesce(current_revision, 0);
  IF expected_revision IS DISTINCT FROM current_revision THEN RETURN public.reminduh_read() || '{"status":"conflict"}'::jsonb; END IF;
  IF payload IS NULL OR pg_catalog.octet_length(payload::text) > 10485760 OR
     payload->>'schemaVersion' IS DISTINCT FROM '1' OR
     jsonb_typeof(payload->'profile') IS DISTINCT FROM 'object' OR
     jsonb_typeof(payload->'medications') IS DISTINCT FROM 'array' OR
     jsonb_typeof(payload->'records') IS DISTINCT FROM 'object' OR
     jsonb_typeof(payload->'preferences') IS DISTINCT FROM 'object' OR
     jsonb_typeof(payload->'market') IS DISTINCT FROM 'object' OR
     jsonb_typeof(payload->'care') IS DISTINCT FROM 'object' OR
     jsonb_typeof(payload->'onboarded') IS DISTINCT FROM 'boolean' OR
     coalesce(length(payload#>>'{profile,name}'), 999) > 40 OR
     coalesce(length(payload#>>'{profile,petName}'), 999) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'This data could not be synced.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(payload->'medications') > 300 OR (SELECT count(*) FROM jsonb_object_keys(payload->'records')) > 50000 OR
     coalesce((payload#>>'{market,coins}')::numeric, -1) NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'This data is outside the supported limits.' USING ERRCODE = '22023';
  END IF;
  -- A device cannot sync its OS permission, notification receipts or snooze state.
  doc := jsonb_set(jsonb_set(payload - 'medications' - 'records' - '_cloud', '{reminders}', '{}'::jsonb), '{preferences,reminders}', 'false'::jsonb);
  INSERT INTO public.reminduh_accounts(user_id, revision, settings) VALUES(uid, current_revision + 1, doc)
    ON CONFLICT(user_id) DO UPDATE SET revision = current_revision + 1, settings = doc, updated_at = now();
  -- Replacement is atomic with the revision check. A stale device cannot resurrect undone doses.
  DELETE FROM public.reminduh_check_ins WHERE user_id = uid;
  DELETE FROM public.reminduh_medications WHERE user_id = uid;
  FOR med IN SELECT value FROM jsonb_array_elements(payload->'medications') LOOP
    IF coalesce(med->>'id', '') !~ '^[a-zA-Z0-9_-]{1,80}$' OR coalesce(length(med->>'name'), 0) NOT BETWEEN 1 AND 80 OR
       coalesce(length(med->>'dosage'), 0) NOT BETWEEN 1 AND 80 OR jsonb_typeof(med->'schedules') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'A medication could not be synced.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.reminduh_medications(user_id, id, name, details) VALUES(uid, med->>'id', med->>'name', med);
  END LOOP;
  FOR item IN SELECT key, value FROM jsonb_each(payload->'records') LOOP
    IF item.key IS DISTINCT FROM item.value->>'id' OR item.key IS DISTINCT FROM
       (item.value->>'medicationId') || '@' || (item.value->>'date') || '@' || (item.value->>'time') OR
       (item.value->>'date') !~ '^\d{4}-\d{2}-\d{2}$' OR (item.value->>'time') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
      RAISE EXCEPTION 'A check-in could not be synced.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.reminduh_check_ins(user_id, id, medication_id, status, recorded_at, details)
      VALUES(uid, item.key, item.value->>'medicationId', item.value->>'status', (item.value->>'recordedAt')::timestamptz, item.value);
  END LOOP;
  RETURN public.reminduh_read() || '{"status":"saved"}'::jsonb;
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_save(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminduh_save(bigint,jsonb) TO authenticated;
--> statement-breakpoint
-- Deletion requires the short-lived proof returned by a fresh email-code sign-in,
-- in addition to a JWT. No caller can name a different account to delete.
CREATE FUNCTION public.reminduh_delete_account(confirmation_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public.reminduh_uid();
BEGIN
  IF confirmation_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM neon_auth.session WHERE "userId" = uid AND token = confirmation_token
      AND "createdAt" > now() - interval '10 minutes' AND "expiresAt" > now()
  ) THEN RAISE EXCEPTION 'Enter a fresh email code before deleting your account.' USING ERRCODE = '28000'; END IF;
  DELETE FROM neon_auth."user" WHERE id = uid;
  RETURN '{"deleted":true}'::jsonb;
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_delete_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminduh_delete_account(text) TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
-- All writes use the checked transactional API. No table has anonymous access.
REVOKE ALL ON public.reminduh_accounts, public.reminduh_medications, public.reminduh_check_ins FROM authenticated, anonymous;
NOTIFY pgrst, 'reload schema';
