-- Harden member-referral enum helper functions flagged by Supabase Security Advisor.
ALTER FUNCTION public.member_referral_reward_type_fixed() SET search_path = public, pg_temp;
ALTER FUNCTION public.member_referral_reward_type_percent() SET search_path = public, pg_temp;
