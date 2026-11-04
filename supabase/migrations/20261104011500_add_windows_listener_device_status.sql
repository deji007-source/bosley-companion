CREATE TABLE IF NOT EXISTS public.device_status (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device),
  CONSTRAINT device_status_device_length CHECK (char_length(device) BETWEEN 1 AND 80)
);

ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own device status" ON public.device_status;
CREATE POLICY "Users can read their own device status"
  ON public.device_status
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.device_status TO authenticated;
GRANT ALL ON public.device_status TO service_role;
