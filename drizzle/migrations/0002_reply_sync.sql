ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS reply_category text;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS reply_summary text;
ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_reply_category_check CHECK (reply_category IS NULL OR reply_category = ANY (ARRAY['interested','meeting_request','need_more_info','not_interested','follow_up_later','out_of_office','unsubscribe','bounce','other']));
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_inbound_once ON public.email_messages (owner_id, gmail_message_id) WHERE direction = 'inbound' AND gmail_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON public.email_messages (gmail_thread_id);
CREATE INDEX IF NOT EXISTS email_messages_inbound_idx ON public.email_messages (owner_id, sent_at DESC) WHERE direction = 'inbound';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_replied_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'total_leads', (SELECT count(*) FROM leads),
    'emails_sent', (SELECT count(*) FROM email_messages WHERE direction='outbound' AND is_test = false AND status IN ('sent','bounced')),
    'bounced', (SELECT count(*) FROM leads WHERE status='bounced'),
    'replies', (SELECT count(DISTINCT lead_id) FROM email_messages WHERE direction='inbound' AND lead_id IS NOT NULL AND coalesce(reply_category,'') <> 'bounce'),
    'interested', (SELECT count(*) FROM leads WHERE status='interested'),
    'meetings', (SELECT count(*) FROM leads WHERE status='meeting_requested'),
    'pending_follow_ups', (SELECT count(*) FROM leads WHERE status='follow_up_required'),
    'queued', (SELECT count(*) FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.status='queued' AND c.status='active'),
    'by_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM leads GROUP BY status) s)
  );
$function$;