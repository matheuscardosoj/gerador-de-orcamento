-- Cada perfil local (empresa/usuário) cria o próprio identificador de computador, então o mesmo
-- Windows aparecia várias vezes na lista "Transferir para" (N-MATHEUS três vezes etc.).
-- Esta função devolve cada computador uma única vez por pessoa: o identificador visto por último.
-- Somente leitura e idempotente; não altera dados. Execute inteiro no SQL Editor.
CREATE OR REPLACE FUNCTION public.gdo_computadores_v4() RETURNS TABLE(id uuid, nome text, visto_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e uuid:=gdo_empresa();
BEGIN
 RETURN QUERY
  SELECT DISTINCT ON (lower(btrim(c.nome)), d.usuario_id) c.id, c.nome, d.visto_em
    FROM computadores c
    JOIN dispositivos_usuarios d ON d.empresa_id=c.empresa_id AND d.dispositivo=c.id
   WHERE c.empresa_id=e
   ORDER BY lower(btrim(c.nome)), d.usuario_id, d.visto_em DESC;
END $$;
REVOKE ALL ON FUNCTION public.gdo_computadores_v4() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdo_computadores_v4() TO authenticated;
NOTIFY pgrst,'reload schema';
