-- Governed Knowledge Component catalog and versioned question mappings.

CREATE TABLE IF NOT EXISTS public.knowledge_components (
  code text PRIMARY KEY,
  standard_id text NOT NULL,
  short_code text NOT NULL,
  statement text NOT NULL CHECK (btrim(statement) <> ''),
  vocabulary text[] NOT NULL DEFAULT '{}',
  catalog_order integer NOT NULL CHECK (catalog_order > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (standard_id, short_code),
  UNIQUE (standard_id, catalog_order),
  CHECK (code = standard_id || regexp_replace(short_code, '[^0-9]', '', 'g'))
);

CREATE INDEX IF NOT EXISTS knowledge_components_active_order_idx
  ON public.knowledge_components (standard_id, catalog_order)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.question_kc_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_set_id text NOT NULL,
  question_id text NOT NULL,
  part_label text,
  format text NOT NULL CHECK (format IN ('mcq', 'saq')),
  standard_id text NOT NULL,
  kc_code text NOT NULL REFERENCES public.knowledge_components(code),
  status text NOT NULL CHECK (status IN ('confirmed', 'unresolved', 'invalid', 'stale')),
  provenance text NOT NULL CHECK (provenance IN ('content', 'model', 'admin')),
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  classification_run_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((format = 'mcq' AND part_label IS NULL) OR (format = 'saq' AND part_label IN ('A', 'B', 'C'))),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (question_set_id, question_id)
    REFERENCES public.generated_questions(set_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS question_kc_assignments_active_part_uidx
  ON public.question_kc_assignments (
    question_set_id,
    question_id,
    COALESCE(part_label, '')
  )
  WHERE valid_to IS NULL AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS question_kc_assignments_candidate_idx
  ON public.question_kc_assignments (kc_code, format, question_set_id, question_id)
  WHERE valid_to IS NULL AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS question_kc_assignments_question_idx
  ON public.question_kc_assignments (question_set_id, question_id, valid_from DESC);

CREATE OR REPLACE FUNCTION public.bkt_question_content_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.sync_question_kc_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_standard_id text := btrim(COALESCE(NEW.payload->>'standardId', ''));
  v_hash text := public.bkt_question_content_hash(NEW.payload);
  v_is_saq boolean := COALESCE(NEW.payload->>'questionType', '') = 'open-ended';
  v_kc_code text;
  v_part record;
  v_mapping_count integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.include_in_self_practice IS NOT DISTINCT FROM OLD.include_in_self_practice THEN
    RETURN NEW;
  END IF;

  UPDATE public.question_kc_assignments
  SET valid_to = now(),
      status = CASE WHEN source_content_hash = v_hash THEN status ELSE 'stale' END
  WHERE question_set_id = NEW.set_id
    AND question_id = NEW.id
    AND valid_to IS NULL
    AND source_content_hash <> v_hash;

  IF v_standard_id = '' THEN
    IF NEW.include_in_self_practice THEN
      RAISE EXCEPTION 'Adaptive-eligible question % requires standardId', NEW.id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_is_saq THEN
    v_kc_code := btrim(COALESCE(NEW.payload->>'kcCode', ''));
    IF v_kc_code <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.knowledge_components kc
        WHERE kc.code = v_kc_code AND kc.standard_id = v_standard_id AND kc.active
      ) THEN
        RAISE EXCEPTION 'Question % has invalid KC % for standard %', NEW.id, v_kc_code, v_standard_id
          USING ERRCODE = '23514';
      END IF;
      UPDATE public.question_kc_assignments
      SET valid_to = now()
      WHERE question_set_id = NEW.set_id AND question_id = NEW.id
        AND part_label IS NULL AND valid_to IS NULL;
      INSERT INTO public.question_kc_assignments (
        question_set_id, question_id, part_label, format, standard_id, kc_code,
        status, provenance, source_content_hash, created_by
      ) VALUES (
        NEW.set_id, NEW.id, NULL, 'mcq', v_standard_id, v_kc_code,
        'confirmed', 'content', v_hash, NEW.user_id
      );
      v_mapping_count := 1;
    END IF;
  ELSE
    FOR v_part IN
      SELECT key AS part_label, value->>'kcCode' AS kc_code
      FROM jsonb_each(COALESCE(NEW.payload#>'{shortAnswer,blueprint,taskSequence}', '{}'::jsonb))
      WHERE key IN ('A', 'B', 'C')
    LOOP
      v_kc_code := btrim(COALESCE(v_part.kc_code, ''));
      IF v_kc_code = '' OR NOT EXISTS (
        SELECT 1 FROM public.knowledge_components kc
        WHERE kc.code = v_kc_code AND kc.standard_id = v_standard_id AND kc.active
      ) THEN
        RAISE EXCEPTION 'Question % part % has invalid KC % for standard %',
          NEW.id, v_part.part_label, v_kc_code, v_standard_id
          USING ERRCODE = '23514';
      END IF;
      UPDATE public.question_kc_assignments
      SET valid_to = now()
      WHERE question_set_id = NEW.set_id AND question_id = NEW.id
        AND part_label = v_part.part_label AND valid_to IS NULL;
      INSERT INTO public.question_kc_assignments (
        question_set_id, question_id, part_label, format, standard_id, kc_code,
        status, provenance, source_content_hash, created_by
      ) VALUES (
        NEW.set_id, NEW.id, v_part.part_label, 'saq', v_standard_id, v_kc_code,
        'confirmed', 'content', v_hash, NEW.user_id
      );
      v_mapping_count := v_mapping_count + 1;
    END LOOP;

    IF v_mapping_count <> jsonb_array_length(COALESCE(NEW.payload#>'{shortAnswer,parts}', '[]'::jsonb)) THEN
      RAISE EXCEPTION 'Every scored part of question % requires exactly one KC', NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.include_in_self_practice AND v_mapping_count = 0 THEN
    RAISE EXCEPTION 'Adaptive-eligible question % requires confirmed KC coverage', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generated_questions_sync_kcs ON public.generated_questions;
CREATE TRIGGER generated_questions_sync_kcs
AFTER INSERT OR UPDATE OF payload, include_in_self_practice
ON public.generated_questions
FOR EACH ROW EXECUTE FUNCTION public.sync_question_kc_assignments();

ALTER TABLE public.knowledge_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_kc_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_components_read_authenticated
  ON public.knowledge_components FOR SELECT TO authenticated USING (true);
CREATE POLICY question_kc_assignments_read_authenticated
  ON public.question_kc_assignments FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.knowledge_components FROM anon, authenticated;
REVOKE ALL ON public.question_kc_assignments FROM anon, authenticated;
GRANT SELECT ON public.knowledge_components TO authenticated;
GRANT SELECT ON public.question_kc_assignments TO authenticated;
GRANT ALL ON public.knowledge_components, public.question_kc_assignments TO service_role;
REVOKE ALL ON FUNCTION public.bkt_question_content_hash(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_question_kc_assignments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bkt_question_content_hash(jsonb) TO service_role;

-- KC_CATALOG_SEED_START

INSERT INTO public.knowledge_components (
  code, standard_id, short_code, statement, vocabulary, catalog_order
) VALUES
  ('3.1.9-12.A1', '3.1.9-12.A', 'A1', 'explain how the sequence of nucleotide bases in a DNA molecule encodes the genetic information needed to build a specific protein.', ARRAY['DNA', 'nucleotide', 'gene', 'base sequence', 'condon']::text[], 1),
  ('3.1.9-12.A2', '3.1.9-12.A', 'A2', 'describe the process of transcription, including how RNA polymerase reads the DNA template strand and produces a complementary pre-mRNA strand, and explain how splicing removes introns and joins exons to produce the mature mRNA transcript.', ARRAY['transcription', 'mRNA', 'RNA polymerase', 'template strand', 'TAC initiation sequence', 'RNA editing', 'introns', 'exons']::text[], 2),
  ('3.1.9-12.A3', '3.1.9-12.A', 'A3', 'explain how ribosomes read codons on an mRNA strand and match them to tRNA anticodons to assemble amino acids in the correct order during translation.', ARRAY['translation', 'codon', 'anticodon', 'ribosome', 'tRNA', 'amino acid']::text[], 3),
  ('3.1.9-12.A4', '3.1.9-12.A', 'A4', 'explain how the sequence of amino acids in a polypeptide determines the protein''s three-dimensional shape.', ARRAY['protein', 'polypeptide', 'amino acid', 'protein structure', 'R groups', 'hydrogen bonding']::text[], 4),
  ('3.1.9-12.A5', '3.1.9-12.A', 'A5', 'explain how a protein''s three-dimensional shape determines its specific function within the cell (e.g., how an enzyme''s active site shape enables it to bind a specific substrate)', ARRAY['protein function', 'structure and function']::text[], 5),
  ('3.1.9-12.A6', '3.1.9-12.A', 'A6', 'explain how cells with identical DNA can become structurally and functionally different by selectively expressing different genes.', ARRAY['gene expression', 'specialized cells', 'differentiation', 'epigenome']::text[], 6),
  ('3.1.9-12.A7', '3.1.9-12.A', 'A7', 'trace the complete pathway from a DNA sequence to a functional protein and predict how a mutation at any step would affect the resulting protein and cell function.', ARRAY['mutation', 'central dogma', 'DNA replication', 'protein synthesis', 'missence', 'nonsense', 'frameshift']::text[], 7),
  ('3.1.9-12.B1', '3.1.9-12.B', 'B1', 'distinguish between unicellular, colonial, and multicellular organisms, and give examples of each', ARRAY['unicellular', 'multicellular', 'colonial']::text[], 1),
  ('3.1.9-12.B2', '3.1.9-12.B', 'B2', 'distinguish between prokaryotic and eukaryotic cells and identify key structural differences between them.', ARRAY['prokaryotic', 'eukaryotic', 'organelles', 'membrane compartmentalization']::text[], 2),
  ('3.1.9-12.B3', '3.1.9-12.B', 'B3', 'sequence the levels of biological organization from cell to organism and describe the role of each level.', ARRAY['cell', 'tissues', 'organs', 'organ system']::text[], 3),
  ('3.1.9-12.B4', '3.1.9-12.B', 'B4', 'explain why multicellular organisms require specialized cells organized into tissues, organs, and organ systems to carry out life functions that a single cell cannot perform alone.', ARRAY['specialized cells', 'tissue', 'organ system', 'function']::text[], 4),
  ('3.1.9-12.B5', '3.1.9-12.B', 'B5', 'explain how two or more organ systems interact with each other to maintain the functioning of the whole organism, using a specific example such as the circulatory and respiratory systems.', ARRAY['circulatory system', 'respiratory system', 'nutrient', 'stimuli', 'system interactions', 'cooperativity', 'feeback regulation']::text[], 5),
  ('3.1.9-12.B6', '3.1.9-12.B', 'B6', 'develop and use a model to illustrate the hierarchical relationships between interacting systems that provide specific functions within a multicellular organism.', ARRAY['model', 'system', 'input', 'output']::text[], 6),
  ('3.1.9-12.C1', '3.1.9-12.C', 'C1', 'define homeostasis and explain why maintaining stable internal conditions is essential for an organism''s survival.', ARRAY['homeostasis', 'internal conditions', 'stability']::text[], 1),
  ('3.1.9-12.C2', '3.1.9-12.C', 'C2', 'explain how negative feedback loops detect a change from a set point and trigger a corrective response to restore stability.', ARRAY['negative feedback', 'feedback loops', 'set point']::text[], 2),
  ('3.1.9-12.C3', '3.1.9-12.C', 'C3', 'explain how positive feedback loops amplify a change rather than correct it, and give a biological example of when positive feedback is beneficial.', ARRAY['positive feedback', 'feedback loops']::text[], 3),
  ('3.1.9-12.C4', '3.1.9-12.C', 'C4', 'describe a specific example of homeostasis (e.g., temperature regulation, blood glucose, osmoregulation) by identifying the stimulus, receptor, control center, effector, and response.', ARRAY['temperature regulation', 'osmoregulation', 'excretory system', 'stomate', 'transpiration.  Effectors', 'target organ']::text[], 4),
  ('3.1.9-12.C5', '3.1.9-12.C', 'C5', 'plan and describe an investigation that would produce reliable data as evidence that a specific feedback mechanism maintains homeostasis, identifying the type and accuracy of data needed.', ARRAY['investigation design', 'evidence', 'reliable data']::text[], 5),
  ('3.1.9-12.E1', '3.1.9-12.E', 'E1', 'identify the reactants and products of photosynthesis and write or interpret the overall chemical equation.', ARRAY['photosynthesis', 'reactant', 'product', 'glucose', 'oxygen', 'carbon dioxide', 'water', 'light (photons)']::text[], 1),
  ('3.1.9-12.E2', '3.1.9-12.E', 'E2', 'explain how chlorophyll and other pigments in the chloroplast capture light energy and use it to drive the conversion of carbon dioxide and water into sugar.', ARRAY['light energy', 'chloroplast', 'chlorophyll', 'chemical energy', 'electron transport chains', 'redox carriers', 'ATP', 'NADPH. Proton battery']::text[], 2),
  ('3.1.9-12.E3', '3.1.9-12.E', 'E3', 'explain how photosynthesis transforms light energy into stored chemical energy in the bonds of glucose molecules.', ARRAY['chemical energy', 'stored energy', 'glucose', 'redox carriers', 'ATP', 'phosphorylation', 'oxidation', 'reduction']::text[], 3),
  ('3.1.9-12.E4', '3.1.9-12.E', 'E4', 'use a model to illustrate the flow of matter and energy into, through, and out of the photosynthesis process.', ARRAY['model', 'input', 'output', 'energy and matter flows']::text[], 4),
  ('3.1.9-12.F1', '3.1.9-12.F', 'F1', 'explain how carbon, hydrogen, and oxygen atoms from sugar molecules can be rearranged and combined with other elements to form a variety of organic molecules.', ARRAY['organic molecules', 'element', 'matter', 'carbon', 'hydrogen', 'oxygen', 'enzymes and specicity']::text[], 1),
  ('3.1.9-12.F2', '3.1.9-12.F', 'F2', 'explain the relationship between monomers and polymers, giving examples of biological monomers (e.g., amino acids, glucose) and the polymers they form (e.g., proteins, starch).', ARRAY['monomer', 'polymer', 'macromolecules', 'hydrolysis', 'dehydration synthesis']::text[], 2),
  ('3.1.9-12.F3', '3.1.9-12.F', 'F3', 'explain how hydrocarbon backbones derived from sugars are used to synthesize amino acids and other large carbon-based molecules needed for building new cells.', ARRAY['hydrocarbon', 'amino acid', 'protein', 'macromolecules', 'enzymes', 'specificity']::text[], 3),
  ('3.1.9-12.F4', '3.1.9-12.F', 'F4', 'construct and revise an explanation for how matter and energy are reorganized as they flow through different organizational levels of living systems.', ARRAY['metabolism', 'energy and matter flows', 'cellular respiration', 'catabolsim and anabolism']::text[], 4),
  ('3.1.9-12.G1', '3.1.9-12.G', 'G1', 'identify the reactants and products of cellular respiration and write or interpret the overall chemical equation.', ARRAY['cellular respiration', 'reactants', 'products', 'glucose', 'oxygen', 'carbon dioxide', 'water', 'enzymes']::text[], 1),
  ('3.1.9-12.G2', '3.1.9-12.G', 'G2', 'explain how the breaking of chemical bonds in food molecules releases energy and how that energy is captured in ATP molecules.', ARRAY['chemical energy', 'food molecule', 'ADP/ATP', 'bond breaking', 'enzymes', 'coupled reactions']::text[], 2),
  ('3.1.9-12.G3', '3.1.9-12.G', 'G3', 'explain the role of mitochondria in cellular respiration and describe how energy stored in food molecules is transferred to ATP through a series of chemical reactions.', ARRAY['mitochondria', 'stored energy', 'net transfer', 'ADP/ATP', 'matrix', 'inner membrane and IM space', 'proton battery', 'enzymes', 'redox carriers']::text[], 3),
  ('3.1.9-12.G4', '3.1.9-12.G', 'G4', 'use a model to illustrate that cellular respiration is a chemical process in which bond-breaking and bond-forming result in a net transfer of energy from food molecules to usable cellular energy.', ARRAY['model', 'net transfer', 'input', 'output', 'energy cannot be created or destroyed', 'enzymes', 'redox carriers', 'coupled reactions', 'phosphorylation']::text[], 4),
  ('3.1.9-12.J1', '3.1.9-12.J', 'J1', 'compare aerobic and anaerobic respiration, explaining the conditions under which each occurs, the reactants and products of each, and the relative amounts of energy each produces.', ARRAY['aerobic respiration', 'anaerobic respiration', 'energy transfer']::text[], 1),
  ('3.1.9-12.J2', '3.1.9-12.J', 'J2', 'explain how photosynthesis and cellular respiration together account for the cycling of carbon and the flow of energy through living systems.', ARRAY['photosynthesis', 'cellular respiration', 'carbon cycle', 'energy transfer', 'carbon coupling', 'oxygen coupling']::text[], 2),
  ('3.1.9-12.J3', '3.1.9-12.J', 'J3', 'construct an explanation, supported by valid evidence, for how matter cycles and energy flows through living systems under both aerobic and anaerobic conditions', ARRAY['cycling of matter', 'energy and matter flows', 'aerobic', 'anaerobic']::text[], 3),
  ('3.1.9-12.H1', '3.1.9-12.H', 'H1', 'identify producers, primary consumers, secondary consumers, and decomposers and explain their roles in a food web.', ARRAY['food chains/webs', 'trophic levels', 'producer', 'consumer', 'decomposer', 'metabolism', 'catabolism', 'anabolism']::text[], 1),
  ('3.1.9-12.H2', '3.1.9-12.H', 'H2', 'explain why only a small fraction of energy (approximately 10%) is transferred from one trophic level to the next and describe where the remaining energy goes.', ARRAY['trophic levels', 'energy transfer', 'conservation of energy', 'metabolism', 'catabolism', 'anabolism']::text[], 2),
  ('3.1.9-12.H3', '3.1.9-12.H', 'H3', 'explain how chemical elements that make up organisms cycle through food webs, the atmosphere, and the soil.', ARRAY['matter cycling', 'food chains/webs', 'chemical elements', 'assimilation', 'metabolism']::text[], 3),
  ('3.1.9-12.H4', '3.1.9-12.H', 'H4', 'use mathematical representations such as energy pyramids and percent-transfer calculations to support claims about the cycling of matter and flow of energy among organisms in an ecosystem.', ARRAY['mathematical representations', 'energy pyramid', 'trophic levels']::text[], 4),
  ('3.1.9-12.K1', '3.1.9-12.K', 'K1', 'identify the four major Earth systems (biosphere, atmosphere, hydrosphere, geosphere) and describe what each system includes.', ARRAY['biosphere', 'atmosphere', 'hydrosphere', 'geosphere']::text[], 1),
  ('3.1.9-12.K2', '3.1.9-12.K', 'K2', 'explain the specific role photosynthesis plays in moving carbon from the atmosphere into living organisms.', ARRAY['photosynthesis', 'carbon cycle', 'biosphere', 'atmosphere']::text[], 2),
  ('3.1.9-12.K3', '3.1.9-12.K', 'K3', 'explain the specific role cellular respiration plays in returning carbon from living organisms back to the atmosphere.', ARRAY['cellular respiration', 'carbon cycle', 'atmosphere']::text[], 3),
  ('3.1.9-12.K4', '3.1.9-12.K', 'K4', 'develop a model to illustrate how photosynthesis and cellular respiration drive the cycling of carbon among the biosphere, atmosphere, hydrosphere, and geosphere.', ARRAY['model', 'carbon cycle', 'systems and system models']::text[], 4),
  ('3.1.9-12.I1', '3.1.9-12.I', 'I1', 'define carrying capacity and explain how it represents the maximum population size an ecosystem can sustainably support.', ARRAY['carrying capacity', 'population', 'ecosystem']::text[], 1),
  ('3.1.9-12.I2', '3.1.9-12.I', 'I2', 'distinguish between biotic and abiotic limiting factors and give examples of each that affect population size.', ARRAY['biotic', 'abiotic', 'limiting factors']::text[], 2),
  ('3.1.9-12.I3', '3.1.9-12.I', 'I3', 'explain how predation, competition, and disease each act as limiting factors that prevent populations from exceeding the carrying capacity of an ecosystem.', ARRAY['predation', 'competition', 'limiting factors', 'population']::text[], 3),
  ('3.1.9-12.I4', '3.1.9-12.I', 'I4', 'use mathematical or computational representations to support an explanation of the factors that affect the carrying capacity of ecosystems at different scales.', ARRAY['scale', 'proportion', 'mathematical representations']::text[], 4),
  ('3.1.9-12.L1', '3.1.9-12.L', 'L1', 'define biodiversity and explain why ecosystems with higher biodiversity tend to be more stable and resilient.', ARRAY['biodiversity', 'ecosystem', 'stability']::text[], 1),
  ('3.1.9-12.L2', '3.1.9-12.L', 'L2', 'explain how biotic factors such as predation and competition affect the size and distribution of populations in an ecosystem.', ARRAY['biotic', 'predation', 'competition', 'population', 'ecosystem']::text[], 2),
  ('3.1.9-12.L3', '3.1.9-12.L', 'L3', 'explain how abiotic factors such as availability of water, nutrients, and sunlight affect the size and distribution of populations in an ecosystem.', ARRAY['abiotic', 'limiting factors', 'population', 'ecosystem']::text[], 3),
  ('3.1.9-12.L4', '3.1.9-12.L', 'L4', 'use mathematical representations to support and revise explanations about the factors affecting biodiversity and population sizes in ecosystems at different scales.', ARRAY['scale', 'proportion', 'mathematical representations', 'biodiversity']::text[], 4),
  ('3.1.9-12.M1', '3.1.9-12.M', 'M1', 'explain how complex interactions among species (e.g., predator-prey, competition, symbiosis) help maintain relatively stable numbers and types of organisms in an ecosystem over time.', ARRAY['ecological relationships', 'niche', 'organism', 'stability']::text[], 1),
  ('3.1.9-12.M2', '3.1.9-12.M', 'M2', 'distinguish between a resilient ecosystem that recovers from a modest disturbance and one that transitions to a fundamentally different ecosystem state after an extreme disturbance.', ARRAY['succession', 'stability and change', 'ecosystem resilience']::text[], 2),
  ('3.1.9-12.M3', '3.1.9-12.M', 'M3', 'explain the concept of ecological succession and describe the sequence of community changes that occur following a disturbance.', ARRAY['succession', 'niche', 'ecological relationships']::text[], 3),
  ('3.1.9-12.M4', '3.1.9-12.M', 'M4', 'evaluate the claims, evidence, and reasoning behind scientific arguments about whether complex ecosystem interactions maintain stability or lead to a new ecosystem state.', ARRAY['claims', 'evidence', 'reasoning', 'stability and change']::text[], 4),
  ('3.1.9-12.D1', '3.1.9-12.D', 'D1', 'identify and sequence the stages of the cell cycle (G1, S, G2, M phase) and describe the key biological event that occurs at each stage.', ARRAY['cell cycle', 'G1', 'S phase', 'G2', 'mitosis', 'interphase']::text[], 1),
  ('3.1.9-12.D2', '3.1.9-12.D', 'D2', 'describe the behavior and movement of chromosomes during each phase of mitosis (prophase, metaphase, anaphase, telophase) and cytokinesis.', ARRAY['mitosis', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'chromosome']::text[], 2),
  ('3.1.9-12.D3', '3.1.9-12.D', 'D3', 'explain why the two daughter cells produced by mitosis are genetically identical to each other and to the original parent cell.', ARRAY['daughter cell', 'genetic material', 'chromosome', 'mitosis']::text[], 3),
  ('3.1.9-12.D4', '3.1.9-12.D', 'D4', 'explain how mitosis enables a multicellular organism to grow, repair damaged tissue, and replace worn-out cells throughout its lifespan.', ARRAY['growth', 'tissue repair', 'multicellular', 'organism']::text[], 4),
  ('3.1.9-12.D5', '3.1.9-12.D', 'D5', 'explain how a single fertilized egg uses differential gene expression to produce many structurally and functionally distinct cell types during development.', ARRAY['differentiation', 'gene expression', 'fertilized egg', 'epigenome']::text[], 5),
  ('3.1.9-12.D6', '3.1.9-12.D', 'D6', 'distinguish between totipotent, pluripotent, and multipotent stem cells and explain how a cell''s developmental potential decreases as differentiation progresses.', ARRAY['stem cell', 'totipotent', 'pluripotent', 'multipotent', 'differentiation']::text[], 6),
  ('3.1.9-12.D7', '3.1.9-12.D', 'D7', 'use a model to illustrate how repeated cycles of mitotic division combined with progressive differentiation produce and maintain the tissues, organs, and organ systems of a complex multicellular organism.', ARRAY['model', 'tissue', 'organ', 'organ system', 'organism', 'input', 'output']::text[], 7),
  ('3.1.9-12.P1', '3.1.9-12.P', 'P1', 'describe the physical structure of a chromosome and explain that each chromosome consists of a DNA molecule made of two strands held together by many weak hydrogen bonds.', ARRAY['chromosome', 'DNA', 'gene', 'nucleotides']::text[], 1),
  ('3.1.9-12.P2', '3.1.9-12.P', 'P2', 'explain that a gene is a specific segment of a chromosome''s DNA and that each gene carries the instructions for producing a specific protein.', ARRAY['gene', 'allele', 'DNA', 'chromosome', 'protein']::text[], 2),
  ('3.1.9-12.P3', '3.1.9-12.P', 'P3', 'explain how proteins produced from gene instructions determine an organism''s characteristic traits.', ARRAY['gene expression', 'protein', 'traits', 'inheritance']::text[], 3),
  ('3.1.9-12.P4', '3.1.9-12.P', 'P4', 'explain why all cells in an organism contain the same DNA but express different genes, resulting in different cell types.', ARRAY['gene expression', 'differentiation', 'DNA']::text[], 4),
  ('3.1.9-12.P5', '3.1.9-12.P', 'P5', 'identify that not all DNA codes for a protein, and explain that some DNA segments serve regulatory or structural functions while others have no currently known function.', ARRAY['DNA', 'non-coding DNA', 'regulatory function']::text[], 5),
  ('3.1.9-12.P6', '3.1.9-12.P', 'P6', 'ask and clarify questions about the role of DNA and chromosomes in coding for characteristic traits that are passed from parents to offspring.', ARRAY['inheritance', 'traits', 'DNA', 'chromosome']::text[], 6),
  ('3.1.9-12.Q1', '3.1.9-12.Q', 'Q1', 'explain how crossing over during meiosis I shuffles genetic material between homologous chromosomes, producing new gene combinations not present in either parent.', ARRAY['meiosis', 'crossing over', 'genetic variation', 'homologous chromosomes']::text[], 1),
  ('3.1.9-12.Q2', '3.1.9-12.Q', 'Q2', 'explain how independent assortment during meiosis produces gametes with different combinations of chromosomes, contributing to genetic variation in offspring.', ARRAY['meiosis', 'independent assortment', 'genetic variation', 'gametes']::text[], 2),
  ('3.1.9-12.Q3', '3.1.9-12.Q', 'Q3', 'explain how errors during DNA replication produce mutations, and distinguish between mutations that are heritable (in gametes) and those that are not (in somatic cells).', ARRAY['genetic mutation', 'DNA replication', 'heritable', 'somatic cell']::text[], 3),
  ('3.1.9-12.Q4', '3.1.9-12.Q', 'Q4', 'explain how environmental factors (e.g., radiation, chemicals) can cause mutations in genes, and how viable mutations can become sources of heritable genetic variation.', ARRAY['genetic mutation', 'environmental factors', 'genetic variation']::text[], 4),
  ('3.1.9-12.Q5', '3.1.9-12.Q', 'Q5', 'make and defend a claim, supported by evidence, that inheritable genetic variation results from new combinations through meiosis, errors during replication, and/or environmentally caused mutations.', ARRAY['meiosis', 'genetic mutation', 'genetic variation', 'heritable']::text[], 5),
  ('3.1.9-12.R1', '3.1.9-12.R', 'R1', 'distinguish between genotype (an organism''s genetic makeup) and phenotype (its observable characteristics).', ARRAY['genotype', 'phenotype']::text[], 1),
  ('3.1.9-12.R2', '3.1.9-12.R', 'R2', 'explain how the same genotype can produce different phenotypes depending on environmental conditions.', ARRAY['genotype', 'phenotype', 'gene expression', 'environmental factors']::text[], 2),
  ('3.1.9-12.R3', '3.1.9-12.R', 'R3', 'explain how the distribution of traits in a population reflects both genetic variation and the influence of environmental factors on gene expression.', ARRAY['population', 'traits', 'gene expression', 'genetic variation']::text[], 3),
  ('3.1.9-12.R4', '3.1.9-12.R', 'R4', 'apply concepts of probability and statistics (e.g., Punnett squares, probability distributions, data plots) to explain the variation and distribution of expressed traits in a population.', ARRAY['probability', 'statistics', 'population', 'phenotype', 'traits']::text[], 4),
  ('3.1.9-12.N1', '3.1.9-12.N', 'N1', 'explain how habitat destruction reduces biodiversity by eliminating the living space and resources that species need to survive.', ARRAY['human disturbances', 'habitat destruction', 'biodiversity', 'ecosystem']::text[], 1),
  ('3.1.9-12.N2', '3.1.9-12.N', 'N2', 'explain how pollution, introduction of invasive species, overexploitation, and climate change each threaten the survival of native species and disrupt ecosystems.', ARRAY['invasive species', 'overexploitation', 'pollution', 'climate change', 'biodiversity']::text[], 2),
  ('3.1.9-12.N3', '3.1.9-12.N', 'N3', 'evaluate a proposed solution for reducing the impact of a specific human activity on an ecosystem, using scientific knowledge and prioritized criteria to assess its effectiveness and trade-offs.', ARRAY['biodiversity', 'stability and change', 'ecosystem']::text[], 3),
  ('3.1.9-12.N4', '3.1.9-12.N', 'N4', 'design and refine a solution to a real-world problem caused by human activity that threatens biodiversity, justifying decisions using student-generated and scientific evidence.', ARRAY['human disturbances', 'biodiversity', 'design solution']::text[], 4),
  ('3.1.9-12.O1', '3.1.9-12.O', 'O1', 'identify and describe specific examples of group behavior in animals (e.g., schooling, herding, cooperative hunting, division of labor in colonies).', ARRAY['group behaviors', 'species']::text[], 1),
  ('3.1.9-12.O2', '3.1.9-12.O', 'O2', 'explain why group behavior evolved through natural selection, describing the specific survival and reproductive advantages membership in a group provides to individuals and their genetic relatives.', ARRAY['natural selection', 'evolution', 'genetic relatedness', 'group behaviors']::text[], 2),
  ('3.1.9-12.O3', '3.1.9-12.O', 'O3', 'distinguish between correlation and causation when analyzing data about the relationship between group behavior and survival or reproductive success.', ARRAY['cause and effect', 'correlation', 'empirical evidence']::text[], 3),
  ('3.1.9-12.O4', '3.1.9-12.O', 'O4', 'evaluate claims and evidence about how a specific group behavior increases the likelihood of survival and reproduction for individuals and their genetic relatives.', ARRAY['group behaviors', 'genetic relatedness', 'cause and effect']::text[], 4),
  ('3.1.9-12.V1', '3.1.9-12.V', 'V1', 'explain how human-induced environmental changes contribute to the expansion of some species and the decline or extinction of others.', ARRAY['human disturbances', 'biodiversity', 'speciation', 'biological extinction']::text[], 1),
  ('3.1.9-12.V2', '3.1.9-12.V', 'V2', 'describe the mathematical assumptions underlying a computational simulation of human impact on biodiversity.', ARRAY['biodiversity', 'speciation', 'biological extinction', 'mathematical model']::text[], 2),
  ('3.1.9-12.V3', '3.1.9-12.V', 'V3', 'create or revise a computational simulation to test a proposed solution that mitigates adverse human impacts on biodiversity, and interpret the simulation''s output.', ARRAY['biodiversity', 'simulation', 'human disturbances', 'cause and effect']::text[], 3),
  ('3.1.9-12.S1', '3.1.9-12.S', 'S1', 'explain how the fossil record provides evidence for biological evolution, including the appearance and disappearance of species over time.', ARRAY['evolution', 'fossil record', 'evolutionary evidence']::text[], 1),
  ('3.1.9-12.S2', '3.1.9-12.S', 'S2', 'explain how similarities and differences in DNA sequences among species provide evidence for common ancestry, with greater sequence similarity indicating more recent common ancestry.', ARRAY['DNA', 'evolution', 'evolutionary evidence', 'common ancestry']::text[], 2),
  ('3.1.9-12.S3', '3.1.9-12.S', 'S3', 'explain how similarities in amino acid sequences, anatomical structures, and embryological development across species provide additional lines of evidence for common ancestry.', ARRAY['amino acid', 'anatomical homology', 'embryological evidence', 'evolutionary evidence']::text[], 3),
  ('3.1.9-12.S4', '3.1.9-12.S', 'S4', 'explain how the ongoing process of branching descent produces multiple lines of descent that can be inferred by comparing the DNA and anatomy of living organisms.', ARRAY['common ancestry', 'evolution', 'divergent evolution']::text[], 4),
  ('3.1.9-12.S5', '3.1.9-12.S', 'S5', 'communicate scientific information that common ancestry and biological evolution are supported by multiple independent lines of empirical evidence, using oral, graphical, textual, or mathematical formats.', ARRAY['evolution', 'evolutionary evidence', 'patterns']::text[], 5),
  ('3.1.9-12.T1', '3.1.9-12.T', 'T1', 'explain the reproductive potential of populations, describing why populations would grow exponentially without limiting factors.', ARRAY['natural selection', 'evolution', 'reproductive potential']::text[], 1),
  ('3.1.9-12.T2', '3.1.9-12.T', 'T2', 'explain how heritable genetic variation, produced by mutation and sexual reproduction, provides the raw material on which natural selection acts.', ARRAY['genetic variation', 'mutation', 'heritable', 'natural selection']::text[], 2),
  ('3.1.9-12.T3', '3.1.9-12.T', 'T3', 'explain how competition among individuals for limited resources results in differential survival based on heritable traits.', ARRAY['competition', 'natural selection', 'biological fitness', 'limited resources']::text[], 3),
  ('3.1.9-12.T4', '3.1.9-12.T', 'T4', 'explain how individuals with advantageous heritable traits are more likely to survive, reproduce, and pass those traits to the next generation.', ARRAY['biological fitness', 'natural selection', 'heritable', 'reproduction']::text[], 4),
  ('3.1.9-12.T5', '3.1.9-12.T', 'T5', 'construct an explanation, supported by evidence, for how the four factors of evolution (reproductive potential, heritable variation, competition, differential reproduction) together drive the evolutionary process.', ARRAY['natural selection', 'evolution', 'biological fitness', 'genetic variation', 'mutation', 'competition']::text[], 5),
  ('3.1.9-12.U1', '3.1.9-12.U', 'U1', 'define biological fitness in terms of an organism''s ability to survive and reproduce in its environment, distinguishing fitness from physical strength.', ARRAY['biological fitness', 'natural selection', 'evolution']::text[], 1),
  ('3.1.9-12.U2', '3.1.9-12.U', 'U2', 'explain how natural selection changes allele frequencies in a population over successive generations when one allele confers a survival or reproductive advantage.', ARRAY['allele frequency', 'natural selection', 'biological fitness']::text[], 2),
  ('3.1.9-12.U3', '3.1.9-12.U', 'U3', 'apply concepts of statistics and probability to support explanations that organisms with an advantageous heritable trait tend to increase in proportion to organisms lacking that trait across generations.', ARRAY['allele frequency', 'natural selection', 'biological fitness', 'probability', 'patterns']::text[], 3),
  ('3.1.9-12.W1', '3.1.9-12.W', 'W1', 'define adaptation and distinguish between anatomical, behavioral, and physiological adaptations, giving an example of each.', ARRAY['adaptation', 'biological fitness', 'natural selection']::text[], 1),
  ('3.1.9-12.W2', '3.1.9-12.W', 'W2', 'explain how differential survival and reproduction of individuals with advantageous heritable traits leads, over many generations, to a population that is better adapted to its environment.', ARRAY['adaptation', 'natural selection', 'biological fitness', 'evolution']::text[], 2),
  ('3.1.9-12.W3', '3.1.9-12.W', 'W3', 'construct an explanation, supported by valid evidence, for how natural selection operating on heritable variation produces adaptation of populations over time.', ARRAY['adaptation', 'biological fitness', 'natural selection', 'evolution']::text[], 3),
  ('3.1.9-12.X1', '3.1.9-12.X', 'X1', 'explain how favorable environmental changes can increase the number of individuals of species whose traits are well-suited to the new conditions.', ARRAY['biodiversity', 'species', 'natural selection']::text[], 1),
  ('3.1.9-12.X2', '3.1.9-12.X', 'X2', 'explain how populations diverging under different environmental conditions can accumulate different genetic changes over time, eventually leading to the emergence of new species (speciation).', ARRAY['speciation', 'divergent evolution', 'genetic variation']::text[], 2),
  ('3.1.9-12.X3', '3.1.9-12.X', 'X3', 'explain why species become extinct when individuals can no longer survive and reproduce in an altered environment and the change is too rapid or drastic for adaptation to occur.', ARRAY['extinction', 'biodiversity', 'species', 'convergent evolution']::text[], 3),
  ('3.1.9-12.X4', '3.1.9-12.X', 'X4', 'evaluate evidence supporting claims that environmental changes may result in population increases for some species, speciation, or extinction, distinguishing between causal relationships and correlations.', ARRAY['biodiversity', 'speciation', 'extinction', 'divergent evolution', 'convergent evolution', 'cause and effect']::text[], 4)
ON CONFLICT (code) DO UPDATE SET
  standard_id = EXCLUDED.standard_id,
  short_code = EXCLUDED.short_code,
  statement = EXCLUDED.statement,
  vocabulary = EXCLUDED.vocabulary,
  catalog_order = EXCLUDED.catalog_order,
  updated_at = now();

-- KC_CATALOG_SEED_END
-- Backfill only valid embedded mappings. Legacy MCQs without kcCode remain
-- unresolved and are handled by the preview/publish classification workflow.
INSERT INTO public.question_kc_assignments (
  question_set_id, question_id, part_label, format, standard_id, kc_code,
  status, provenance, source_content_hash, created_by
)
SELECT q.set_id, q.id, NULL, 'mcq', q.payload->>'standardId', q.payload->>'kcCode',
  'confirmed', 'content', public.bkt_question_content_hash(q.payload), q.user_id
FROM public.generated_questions q
JOIN public.knowledge_components kc
  ON kc.code = q.payload->>'kcCode'
  AND kc.standard_id = q.payload->>'standardId'
  AND kc.active
WHERE COALESCE(q.payload->>'questionType', 'mcq') <> 'open-ended'
  AND btrim(COALESCE(q.payload->>'kcCode', '')) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.question_kc_assignments (
  question_set_id, question_id, part_label, format, standard_id, kc_code,
  status, provenance, source_content_hash, created_by
)
SELECT q.set_id, q.id, parts.key, 'saq', q.payload->>'standardId', parts.value->>'kcCode',
  'confirmed', 'content', public.bkt_question_content_hash(q.payload), q.user_id
FROM public.generated_questions q
CROSS JOIN LATERAL jsonb_each(
  COALESCE(q.payload#>'{shortAnswer,blueprint,taskSequence}', '{}'::jsonb)
) parts
JOIN public.knowledge_components kc
  ON kc.code = parts.value->>'kcCode'
  AND kc.standard_id = q.payload->>'standardId'
  AND kc.active
WHERE q.payload->>'questionType' = 'open-ended'
  AND parts.key IN ('A', 'B', 'C')
ON CONFLICT DO NOTHING;
