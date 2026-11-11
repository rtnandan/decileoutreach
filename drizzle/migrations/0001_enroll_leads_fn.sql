CREATE OR REPLACE FUNCTION public.enroll_leads(
  _campaign_id uuid,
  _statuses text[] DEFAULT NULL,
  _lead_ids uuid[] DEFAULT NULL,
  _skip_contacted boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE id = _campaign_id) THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  INSERT INTO campaign_leads (owner_id, campaign_id, lead_id)
  SELECT l.owner_id, _campaign_id, l.id
  FROM leads l
  WHERE (_statuses IS NULL OR l.status = ANY(_statuses))
    AND (_lead_ids IS NULL OR l.id = ANY(_lead_ids))
    AND l.status NOT IN ('unsubscribed','bounced')
    AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.owner_id = l.owner_id AND s.email = l.email)
    AND (NOT _skip_contacted OR NOT EXISTS (
      SELECT 1 FROM campaign_leads o
      WHERE o.lead_id = l.id AND o.campaign_id <> _campaign_id AND o.status IN ('queued','sending','sent')))
  ON CONFLICT (campaign_id, lead_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = _campaign_id AND status = 'completed') AND n > 0 THEN
    UPDATE campaigns SET status = 'paused', completed_at = NULL WHERE id = _campaign_id;
  END IF;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.enroll_leads(uuid, text[], uuid[], boolean) TO authenticated;