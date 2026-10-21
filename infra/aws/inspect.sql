-- Metadata only. Never migrate or seed the existing maintenance database.
BEGIN READ ONLY;
SELECT json_build_object(
    'current_database', current_database(),
    'current_user', current_user,
    'version', version(),
    'server_version_num', current_setting('server_version_num'),
    'in_recovery', pg_is_in_recovery(),
    'transaction_read_only', current_setting('transaction_read_only'),
    'force_ssl', current_setting('rds.force_ssl', true),
    'tls', (
        SELECT json_build_object('ssl', ssl, 'version', version, 'cipher', cipher)
        FROM pg_stat_ssl WHERE pid = pg_backend_pid()
    ),
    'role_flags', (
        SELECT json_build_object(
            'superuser', rolsuper,
            'create_database', rolcreatedb,
            'create_role', rolcreaterole,
            'bypass_rls', rolbypassrls
        ) FROM pg_roles WHERE rolname = current_user
    ),
    'database_connect', has_database_privilege(current_user, current_database(), 'CONNECT'),
    'database_create_schema', has_database_privilege(current_user, current_database(), 'CREATE'),
    'staging_database_exists', EXISTS (
        SELECT 1 FROM pg_database WHERE datname = 'dzirent_staging'
    ),
    'staging_roles_present', (
        SELECT count(*) FROM pg_roles
        WHERE rolname IN ('dzirent_staging_migrator', 'dzirent_staging_app')
    ),
    'user_relation_count', (
        SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp%'
          AND c.relkind IN ('r', 'p')
    )
);
ROLLBACK;
