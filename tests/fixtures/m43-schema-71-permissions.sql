-- Resolver / role-helper ACLs are witnessed by live export65. The original
-- ops_push ACL and table/default ACLs are absent from71: the following are
-- explicit test profiles, not purported production ACL reconstructions.
REVOKE ALL ON FUNCTION public.zezms_m5a4_resolve_device(text,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.zezms_ops_push(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.zezms_ops_push(jsonb) TO authenticated;
-- Stress migration revocations against permissive inherited defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC,anon,authenticated;
