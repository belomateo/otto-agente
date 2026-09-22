-- 0064_base_prompt_no_se_guarda_si_no_sirve.sql — que no se pueda guardar un prompt que Lucía
-- después no va a poder usar.
--
-- EL AGUJERO (auditoría del 22/9). El prompt pasa por DOS validadores distintos, en dos momentos
-- distintos, y no son el mismo:
--   · al GUARDAR, el panel corre el generador de agente (scripts/armar-prompt.mjs --solo-validar,
--     vía panel/lib/edicion/prompt.ts). Si pasa, guarda y dice "guardado".
--   · al USAR, el worker llama a prompt_vigente() (0050/0051), que valida de nuevo con SUS reglas:
--     ningún marcador sin resolver, primera línea "Sos Lucía,", el encabezado REGLAS QUE NUNCA
--     ROMPES presente, y las reglas cargadas realmente adentro del texto.
--
-- Si el segundo rechaza lo que el primero aceptó, prompt_vigente() devuelve null y el worker cae
-- —por diseño, y está bien que caiga— al prompt.md horneado adentro de la función. El problema no
-- es el respaldo: es que la dueña ve "guardado", cierra el panel, y Lucía sigue hablando con el
-- prompt viejo sin que nada lo avise. Es exactamente el modo de falla de 0051 (el arnés escribió
-- 47 caracteres en prompt_base y Lucía contestó vacío turno tras turno), pero al revés: allá
-- entraba basura que SÍ pasaba las guardas, acá entra algo que NO las pasa y igual se guarda.
--
-- EL ARREGLO. Un trigger AFTER UPDATE/INSERT que llama a prompt_vigente() con la fila nueva ya
-- escrita: si devuelve null, levanta excepción y la transacción se va abajo. O sea, no se puede
-- guardar un prompt que no se pueda usar. Se hace acá y no en el panel a propósito: así vale para
-- cualquiera que escriba en la tabla —el panel, un script, alguien con la conexión directa—, no
-- solo para el camino que hoy pasa por lib/edicion.
--
-- El mensaje es para que lo lea una persona, no un programador: la dueña tiene que entender qué
-- le falta al texto que acaba de pegar.
--
-- POR QUÉ AFTER Y NO BEFORE: prompt_vigente() lee `select texto from prompt_base limit 1`. En un
-- BEFORE la tabla todavía tiene el valor VIEJO, así que validaría lo que estaba antes y no lo que
-- se está guardando. En un AFTER, dentro de la misma transacción, ya ve la fila nueva.
--
-- Idempotente: drop trigger if exists + create.
create or replace function prompt_base_tiene_que_servir()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if prompt_vigente() is null then
    raise exception using
      errcode = '23514',
      message = 'Ese prompt no se puede usar y por eso no se guarda',
      detail  = 'Lucía lo rechaza al armarlo. Revisá que: la primera línea empiece con "Sos Lucía,", que esté el encabezado REGLAS QUE NUNCA ROMPES, que el marcador {{REGLAS_NUMERADAS}} siga en el texto, y que no haya quedado ningún {{ }} o [[ ]] sin reemplazar.',
      hint    = 'Si lo guardara igual, el panel diría "guardado" y Lucía seguiría hablando con el prompt anterior sin avisar.';
  end if;
  return null; -- AFTER trigger: el valor de retorno se ignora
end;
$$;

drop trigger if exists trg_prompt_base_tiene_que_servir on prompt_base;
create trigger trg_prompt_base_tiene_que_servir
  after insert or update of texto on prompt_base
  for each row execute function prompt_base_tiene_que_servir();

comment on function prompt_base_tiene_que_servir() is
  'Impide guardar en prompt_base un texto que prompt_vigente() después rechazaría: sin esto el panel decía "guardado" y Lucía seguía usando el prompt anterior en silencio (auditoría 22/9).';
