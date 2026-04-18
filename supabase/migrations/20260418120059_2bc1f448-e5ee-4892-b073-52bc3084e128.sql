-- Make update_payment_settings idempotent: insert singleton row if missing
CREATE OR REPLACE FUNCTION public.update_payment_settings(_number text, _name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_settings WHERE singleton = true) THEN
    UPDATE public.payment_settings
       SET easypaisa_number = _number,
           easypaisa_name = _name,
           updated_at = now()
     WHERE singleton = true;
  ELSE
    INSERT INTO public.payment_settings (singleton, easypaisa_number, easypaisa_name)
    VALUES (true, _number, _name);
  END IF;
END;
$function$;

-- Seed singleton row so the Buy screen always finds it
INSERT INTO public.payment_settings (singleton, easypaisa_number, easypaisa_name)
SELECT true, '03486535749', 'Irshad Bibi'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_settings WHERE singleton = true);