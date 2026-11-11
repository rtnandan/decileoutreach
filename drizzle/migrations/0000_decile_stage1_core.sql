-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Settings (one row per owner)
CREATE TABLE public.app_settings (
  owner_id uuid PRIMARY KEY,
  app_url text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  signature text NOT NULL DEFAULT '',
  first_campaign_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.app_settings FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sending accounts (Gmail connections)
CREATE TABLE public.sending_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  email text NOT NULL,
  from_name text NOT NULL DEFAULT '',
  secret_name text NOT NULL,
  daily_limit integer NOT NULL DEFAULT 250 CHECK (daily_limit BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error','rate_limited')),
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, secret_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_accounts TO authenticated;
GRANT ALL ON public.sending_accounts TO service_role;
ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.sending_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER sending_accounts_updated BEFORE UPDATE ON public.sending_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'not_contacted' CHECK (status IN (
    'not_contacted','email_sent','delivered','replied','interested','meeting_requested',
    'follow_up_required','not_interested','unsubscribed','bounced')),
  source text NOT NULL DEFAULT 'manual',
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);
CREATE INDEX leads_owner_status_idx ON public.leads (owner_id, status);
CREATE INDEX leads_owner_created_idx ON public.leads (owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leads" ON public.leads FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lowercase/trim emails on write
CREATE OR REPLACE FUNCTION public.normalize_email_col()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.email = lower(btrim(NEW.email)); RETURN NEW; END; $$;
CREATE TRIGGER leads_normalize_email BEFORE INSERT OR UPDATE OF email ON public.leads FOR EACH ROW EXECUTE FUNCTION public.normalize_email_col();

-- Suppression list
CREATE TABLE public.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'manual' CHECK (reason IN ('unsubscribe','bounce','manual','complaint')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppressions TO authenticated;
GRANT ALL ON public.suppressions TO service_role;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own suppressions" ON public.suppressions FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER suppressions_normalize_email BEFORE INSERT OR UPDATE OF email ON public.suppressions FOR EACH ROW EXECUTE FUNCTION public.normalize_email_col();

-- Campaigns
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  account_ids uuid[] NOT NULL DEFAULT '{}',
  daily_limit integer NOT NULL DEFAULT 250 CHECK (daily_limit BETWEEN 1 AND 5000),
  batch_size integer NOT NULL DEFAULT 5 CHECK (batch_size BETWEEN 1 AND 5),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Campaign recipients (one row per lead per campaign = no duplicate enrolment)
CREATE TABLE public.campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','skipped')),
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  gmail_thread_id text,
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX campaign_leads_campaign_status_idx ON public.campaign_leads (campaign_id, status);
CREATE INDEX campaign_leads_lead_idx ON public.campaign_leads (lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_leads TO authenticated;
GRANT ALL ON public.campaign_leads TO service_role;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campaign leads" ON public.campaign_leads FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER campaign_leads_updated BEFORE UPDATE ON public.campaign_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Email log (each individual message; step 0 = first email, later steps = follow-ups)
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_lead_id uuid REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  is_test boolean NOT NULL DEFAULT false,
  sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  from_email text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','bounced','received')),
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_messages_one_per_step ON public.email_messages (campaign_lead_id, step) WHERE campaign_lead_id IS NOT NULL AND direction = 'outbound';
CREATE INDEX email_messages_account_sent_idx ON public.email_messages (sending_account_id, sent_at);
CREATE INDEX email_messages_lead_idx ON public.email_messages (lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email messages" ON public.email_messages FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Dashboard stats (runs as the caller, so RLS scopes to their data)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_leads', (SELECT count(*) FROM leads),
    'emails_sent', (SELECT count(*) FROM email_messages WHERE direction='outbound' AND is_test = false AND status IN ('sent','bounced')),
    'bounced', (SELECT count(*) FROM leads WHERE status='bounced'),
    'replies', (SELECT count(*) FROM leads WHERE status IN ('replied','interested','meeting_requested','not_interested','follow_up_required')),
    'interested', (SELECT count(*) FROM leads WHERE status='interested'),
    'meetings', (SELECT count(*) FROM leads WHERE status='meeting_requested'),
    'pending_follow_ups', (SELECT count(*) FROM leads WHERE status='follow_up_required'),
    'queued', (SELECT count(*) FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.status='queued' AND c.status='active'),
    'by_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM leads GROUP BY status) s)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaign_stats()
RETURNS TABLE (campaign_id uuid, total bigint, queued bigint, sending bigint, sent bigint, failed bigint, skipped bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT campaign_id,
    count(*),
    count(*) FILTER (WHERE status='queued'),
    count(*) FILTER (WHERE status='sending'),
    count(*) FILTER (WHERE status='sent'),
    count(*) FILTER (WHERE status='failed'),
    count(*) FILTER (WHERE status='skipped')
  FROM campaign_leads GROUP BY campaign_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_campaign_stats() TO authenticated;

-- Email counts sent since a moment, per sending account (for daily limits)
CREATE OR REPLACE FUNCTION public.get_sent_counts_since(_since timestamptz)
RETURNS TABLE (sending_account_id uuid, campaign_id uuid, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT sending_account_id, campaign_id, count(*)
  FROM email_messages
  WHERE direction='outbound' AND sent_at >= _since AND status IN ('sent','bounced')
  GROUP BY sending_account_id, campaign_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_sent_counts_since(timestamptz) TO authenticated, service_role;