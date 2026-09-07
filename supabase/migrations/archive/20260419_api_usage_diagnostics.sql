-- Migration: api_usage_diagnostics
-- Applied: 2026-04-19 as part of v0.2.1
-- Purpose: add response_preview and error_message for Sonnet/Haiku call debugging

ALTER TABLE public.api_usage
  ADD COLUMN IF NOT EXISTS response_preview text NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL;

COMMENT ON COLUMN public.api_usage.response_preview IS
  'First ~500 chars of the raw Sonnet/Haiku response body for debugging. Nullable.';
COMMENT ON COLUMN public.api_usage.error_message IS
  'Parse error, validation error, or other post-response failure reason. Nullable.';

CREATE INDEX IF NOT EXISTS idx_api_usage_errors
  ON public.api_usage (created_at DESC)
  WHERE error_message IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_skill_update_diagnostics(
  p_usage_id uuid,
  p_response_preview text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
BEGIN
  SELECT family_id INTO v_family_id FROM api_usage WHERE id = p_usage_id;
  IF v_family_id IS NULL THEN RETURN; END IF;
  IF NOT fn_user_in_family(v_family_id) THEN
    RAISE EXCEPTION 'unauthorized: caller is not a member of family %', v_family_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE api_usage
  SET
    response_preview = COALESCE(p_response_preview, response_preview),
    error_message    = COALESCE(p_error_message, error_message)
  WHERE id = p_usage_id;
END;
$$;
