-- Desfaz a migração 014: remove a função. O aplicativo volta a listar todos os identificadores
-- de computador (com repetições de nome), como antes.
DROP FUNCTION IF EXISTS public.gdo_computadores_v4();
NOTIFY pgrst,'reload schema';
