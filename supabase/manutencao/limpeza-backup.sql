-- Backup, SOMENTE LEITURA, do que limpeza-executar.sql apaga (empresa TESTE e 3 contas de teste).
-- Execute no SQL Editor antes da limpeza e use "Export" > JSON (ou copie o resultado) para guardar o arquivo.
SELECT jsonb_build_object(
  'gerado_em', now(),
  'empresa', (SELECT to_jsonb(e) FROM public.empresas e WHERE id = '17488fc0-3f84-47ac-9de5-a5f9874895f1'),
  'usuarios', (SELECT jsonb_agg(jsonb_build_object('id', id, 'email', email, 'created_at', created_at,
                    'last_sign_in_at', last_sign_in_at, 'user_metadata', raw_user_meta_data))
                 FROM auth.users
                WHERE id IN ('fe315453-3254-4bc7-8ce4-ecd266e93325','ebf4414a-c387-446a-8dc9-afcc2f149699','ca5d7068-8001-4685-af15-08cb715af2d1')),
  'tabelas', (
    SELECT jsonb_object_agg(t.s || '.' || t.n,
             (xpath('/*', query_to_xml(format('SELECT * FROM %I.%I WHERE empresa_id=%L', t.s, t.n,
                '17488fc0-3f84-47ac-9de5-a5f9874895f1'), false, false, '')))[1]::text)
      FROM (SELECT c.table_schema AS s, c.table_name AS n
              FROM information_schema.columns c
              JOIN information_schema.tables x ON x.table_schema = c.table_schema
               AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
             WHERE c.column_name = 'empresa_id' AND c.table_schema IN ('public','central','sincronizacao')
             GROUP BY 1, 2) t
     WHERE (xpath('count(/*/*)', query_to_xml(format('SELECT 1 FROM %I.%I WHERE empresa_id=%L', t.s, t.n,
                '17488fc0-3f84-47ac-9de5-a5f9874895f1'), false, false, '')))[1]::text::int > 0
  )
) AS backup;
