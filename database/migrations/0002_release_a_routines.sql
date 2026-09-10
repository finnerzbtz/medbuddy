-- Release A lives in the existing account snapshot. Medication tables remain separate.
CREATE OR REPLACE FUNCTION public.reminduh_valid_self_care(sc jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE r jsonb; s jsonb; item record; rid text; ids text[] := '{}'; prior_day text; n numeric;
BEGIN
  IF jsonb_typeof(sc) IS DISTINCT FROM 'object' OR
    jsonb_typeof(sc->'routines') IS DISTINCT FROM 'array' OR
    jsonb_typeof(sc->'records') IS DISTINCT FROM 'object' OR
    jsonb_typeof(sc->'overrides') IS DISTINCT FROM 'object' OR
    jsonb_typeof(sc->'rewards') IS DISTINCT FROM 'object' OR
    jsonb_typeof(sc->'introductionDismissed') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
  IF jsonb_array_length(sc->'routines') > 100 OR
    (SELECT count(*) FROM jsonb_object_keys(sc->'records')) > 50000 OR
    (SELECT count(*) FROM jsonb_object_keys(sc->'rewards')) > 50000 OR
    (SELECT count(*) FROM jsonb_object_keys(sc->'overrides')) > 50000 THEN RETURN false; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(sc->'routines') LOOP
    rid := r->>'id';
    IF coalesce(rid,'') !~ '^[a-zA-Z0-9_-]{1,80}$' OR rid = ANY(ids) OR
       coalesce(length(btrim(r->>'title')),0) NOT BETWEEN 1 AND 80 OR length(r->>'title') > 80 OR
       coalesce(r->>'category','') NOT IN ('rest','everyday-care','enjoyment','connection','preparation') OR
       jsonb_typeof(r->'archived') IS DISTINCT FROM 'boolean' OR
       coalesce(r->>'createdAt','') !~ '^\d{4}-\d\d-\d\dT' OR length(r->>'createdAt') > 40 OR
       jsonb_typeof(r->'schedules') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    PERFORM (r->>'createdAt')::timestamptz;
    IF r ? 'activity' AND coalesce(r->>'activity','') NOT IN ('tea','sand','garden','bed','music') THEN RETURN false; END IF;
    IF jsonb_array_length(r->'schedules') NOT BETWEEN 1 AND 2000 THEN RETURN false; END IF;
    ids := array_append(ids,rid); prior_day := NULL;
    FOR s IN SELECT value FROM jsonb_array_elements(r->'schedules') LOOP
      IF coalesce(s->>'from','') !~ '^\d{4}-\d\d-\d\d$' OR jsonb_typeof(s->'active') IS DISTINCT FROM 'boolean' OR
         jsonb_typeof(s->'days') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      PERFORM (s->>'from')::date;
      IF prior_day IS NOT NULL AND s->>'from' <= prior_day THEN RETURN false; END IF;
      prior_day := s->>'from';
      IF jsonb_array_length(s->'days') NOT BETWEEN 1 AND 7 OR
        (SELECT count(DISTINCT value) FROM jsonb_array_elements(s->'days')) <> jsonb_array_length(s->'days') OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(s->'days') d WHERE d::text !~ '^[0-6]$') THEN RETURN false; END IF;
      IF s ? 'time' AND coalesce(s->>'time','') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(sc->'rewards') UNION ALL SELECT key,value FROM jsonb_each(sc->'records') UNION ALL SELECT key,value FROM jsonb_each(sc->'overrides') LOOP
    IF item.key !~ '^[a-zA-Z0-9_-]{1,80}@\d{4}-\d\d-\d\d$' OR
       NOT (split_part(item.key,'@',1) = ANY(ids)) OR jsonb_typeof(item.value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    PERFORM split_part(item.key,'@',2)::date;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(sc->'rewards') LOOP
    IF jsonb_typeof(item.value->'amount') IS DISTINCT FROM 'number' OR coalesce(item.value->>'rewardDay','') !~ '^\d{4}-\d\d-\d\d$' THEN RETURN false; END IF;
    n := (item.value->>'amount')::numeric;
    IF n NOT BETWEEN 0 AND 5 OR n <> trunc(n) THEN RETURN false; END IF;
    PERFORM (item.value->>'rewardDay')::date;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_each(sc->'rewards') GROUP BY value->>'rewardDay' HAVING sum((value->>'amount')::numeric)>15) THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(sc->'records') LOOP
    IF item.key IS DISTINCT FROM item.value->>'id' OR item.key IS DISTINCT FROM (item.value->>'routineId')||'@'||(item.value->>'date') OR
      coalesce(item.value->>'status','') NOT IN ('done','skipped') OR
      coalesce(length(btrim(item.value->>'title')),0) NOT BETWEEN 1 AND 80 OR length(item.value->>'title') > 80 OR
      coalesce(item.value->>'category','') NOT IN ('rest','everyday-care','enjoyment','connection','preparation') OR
      coalesce(item.value->>'recordedAt','') !~ '^\d{4}-\d\d-\d\dT' OR length(item.value->>'recordedAt') > 40 OR
      NOT (sc->'rewards' ? item.key) THEN RETURN false; END IF;
    PERFORM (item.value->>'recordedAt')::timestamptz;
  END LOOP;
  FOR item IN SELECT key,value FROM jsonb_each(sc->'overrides') LOOP
    IF item.value ? 'hiddenForToday' AND jsonb_typeof(item.value->'hiddenForToday') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    IF item.value ? 'laterAt' THEN
      IF coalesce(item.value->>'laterAt','') !~ '^\d{4}-\d\d-\d\dT' OR length(item.value->>'laterAt')>40 THEN RETURN false; END IF;
      PERFORM (item.value->>'laterAt')::timestamptz;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_valid_self_care(jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reminduh_protocol() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.reminduh_uid();
  RETURN '{"minSchema":1,"maxSchema":2,"monotonicSchema":true}'::jsonb;
END; $$;
REVOKE ALL ON FUNCTION public.reminduh_protocol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminduh_protocol() TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reminduh_save(expected_revision bigint, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public.reminduh_uid(); current_revision bigint; stored_schema_version integer; med jsonb; item record; doc jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT revision, (settings->>'schemaVersion')::integer INTO current_revision, stored_schema_version FROM public.reminduh_accounts WHERE user_id = uid FOR UPDATE;
  current_revision := coalesce(current_revision, 0);
  -- Version guards precede CAS: old clients cannot replace or discard v2 extensions.
  IF coalesce(payload->>'schemaVersion','') NOT IN ('1','2') OR coalesce(stored_schema_version,1) > 2 THEN
    RAISE EXCEPTION 'Update Reminduh to sync this data. Your device copy is safe.' USING ERRCODE = 'PT409';
  END IF;
  IF (payload->>'schemaVersion')::integer < coalesce(stored_schema_version,1) THEN
    RAISE EXCEPTION 'Update Reminduh to sync this data. Your device copy is safe.' USING ERRCODE = 'PT409';
  END IF;
  IF payload->>'schemaVersion' = '2' AND NOT public.reminduh_valid_self_care(payload->'selfCare') THEN
    RAISE EXCEPTION 'Optional routines could not be synced. Your device copy is safe.' USING ERRCODE = '22023';
  END IF;
  IF expected_revision IS DISTINCT FROM current_revision THEN RETURN public.reminduh_read() || '{"status":"conflict"}'::jsonb; END IF;
  IF payload IS NULL OR pg_catalog.octet_length(payload::text) > 10485760 OR
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

NOTIFY pgrst, 'reload schema';
