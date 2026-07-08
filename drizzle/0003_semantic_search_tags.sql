-- Semantic search + tag taxonomy schema. Canonical source: booklooptag.md.
--
-- NOTE: pgvector must be enabled before this runs. Supabase restricts
-- CREATE EXTENSION to the dashboard (Database -> Extensions -> "vector") or a
-- superuser SQL run, so it is intentionally omitted here (same pattern as
-- 0001_books_fts.sql with pg_trgm). Enable it first, then run this migration.
--
-- Everything below is idempotent (IF NOT EXISTS / ON CONFLICT), so it is safe
-- to run via `db:migrate` or by pasting into the Supabase SQL editor.

-- Canonical tag vocabulary
CREATE TABLE IF NOT EXISTS "tag_taxonomy" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace    TEXT NOT NULL,
  name         TEXT NOT NULL,
  full_tag     TEXT GENERATED ALWAYS AS (namespace || ':' || name) STORED,
  description  TEXT,
  mode         TEXT NOT NULL DEFAULT 'any',
  is_open      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, name)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_namespace ON tag_taxonomy (namespace);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_full_tag  ON tag_taxonomy (full_tag);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_mode      ON tag_taxonomy (mode);--> statement-breakpoint

-- Synonym -> canonical tag mapping
CREATE TABLE IF NOT EXISTS "tag_synonyms" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias         TEXT NOT NULL UNIQUE,
  canonical_tag TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_tag_synonyms_alias ON tag_synonyms (alias);--> statement-breakpoint

-- Implications: when tag A is present, tag B is automatically added
CREATE TABLE IF NOT EXISTS "tag_implications" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  antecedent  TEXT NOT NULL,
  consequent  TEXT NOT NULL,
  UNIQUE (antecedent, consequent)
);--> statement-breakpoint

-- Tags on individual journal entries
CREATE TABLE IF NOT EXISTS "journal_entry_tags" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  namespace  TEXT NOT NULL,
  name       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'bedrock',
  verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, tag)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_entry_tags_entry_id  ON journal_entry_tags (entry_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag        ON journal_entry_tags (tag);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_tags_namespace  ON journal_entry_tags (namespace);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_tags_verified   ON journal_entry_tags (verified);--> statement-breakpoint

-- Embedding + processing status on journal entries
-- 1024 dims = Amazon Titan Text Embeddings V2 (supports 256/512/1024, NOT 1536).
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending';--> statement-breakpoint

-- Full-text index for the FTS ranker in hybridSearch (semantic-search.md M2).
CREATE INDEX IF NOT EXISTS idx_journal_entries_fts
  ON journal_entries USING GIN (to_tsvector('english', content));--> statement-breakpoint

-- The HNSW vector index (semantic-search.md M1) is intentionally NOT created
-- here. Build it manually once >100 entries have embeddings:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_embedding
--     ON journal_entries USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);

-- ============================================================
-- SEED: taxonomy (universal)
-- ============================================================
INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES
('type', 'reflection',     'Personal reaction or feelings',                  'any'),
('type', 'quote',          'Verbatim or near-verbatim text from the work',   'any'),
('type', 'summary',        'Plot or argument recap',                         'any'),
('type', 'prediction',     'Guess about future events or conclusions',       'any'),
('type', 'critique',       'Critical analysis or evaluation',                'any'),
('type', 'connection',     'Link to another work or real-world idea',        'any'),
('type', 'question',       'An open question the reader wants answered',     'any'),
('type', 'note',           'Short note, catch-all',                          'any'),
('type', 'analysis',       'Deeper structural or thematic breakdown',        'any'),
('type', 'character-study','Entry focused on a character',                   'narrative'),
('mode', 'narrative',  'Fiction, manga, graphic novels, creative nonfiction', 'any'),
('mode', 'academic',   'Papers, textbooks, essays, research',                 'any'),
('mode', 'hybrid',     'Narrative nonfiction',                                'any')
ON CONFLICT (namespace, name) DO NOTHING;--> statement-breakpoint

-- ============================================================
-- SEED: taxonomy (narrative)
-- ============================================================
INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES
('theme', 'betrayal',      'Trust broken between characters',              'narrative'),
('theme', 'redemption',    'Seeking or achieving forgiveness',             'narrative'),
('theme', 'sacrifice',     'Giving up something of value',                 'narrative'),
('theme', 'power',         'Pursuit, abuse, or loss of power',             'narrative'),
('theme', 'identity',      'Who a character is or is becoming',            'narrative'),
('theme', 'loss',          'Death, separation, grief as story driver',     'narrative'),
('theme', 'found-family',  'Chosen bonds replacing blood family',          'narrative'),
('theme', 'revenge',       'Vengeance as motivation',                      'narrative'),
('theme', 'coming-of-age', 'Growth from youth to maturity',                'narrative'),
('theme', 'war',           'Armed conflict and its consequences',          'narrative'),
('theme', 'love',          'Romantic, familial, or platonic love',         'narrative'),
('theme', 'mortality',     'Death, aging, impermanence',                   'narrative'),
('theme', 'freedom',       'Liberation, autonomy, escape',                 'narrative'),
('theme', 'justice',       'Fairness, law, moral reckoning',               'narrative'),
('theme', 'isolation',     'Loneliness, exile, alienation',                'narrative'),
('theme', 'corruption',    'Moral decay, institutions failing',            'narrative'),
('theme', 'loyalty',       'Fidelity to people or ideals',                 'narrative'),
('theme', 'hope',          'Optimism against adversity',                   'narrative'),
('theme', 'survival',      'Staying alive under extreme conditions',       'narrative'),
('theme', 'fate',          'Destiny, prophecy, determinism',               'narrative'),
('theme', 'ambition',      'Drive to achieve at any cost',                 'narrative'),
('theme', 'honor',         'Code of conduct, reputation, shame',           'narrative'),
('theme', 'truth',         'Honesty, revelation, nature of reality',       'narrative'),
('theme', 'cycle',         'History repeating, generational patterns',     'narrative'),
('theme', 'transformation','Fundamental change in character or world',     'narrative'),
('emotion', 'grief',       'Deep sadness, mourning',                       'narrative'),
('emotion', 'joy',         'Happiness, delight',                           'narrative'),
('emotion', 'rage',        'Anger, fury',                                  'narrative'),
('emotion', 'dread',       'Anticipatory fear, unease',                    'narrative'),
('emotion', 'awe',         'Wonder, reverence',                            'narrative'),
('emotion', 'hope',        'Optimistic feeling',                           'narrative'),
('emotion', 'melancholy',  'Wistful sadness, bittersweet',                 'narrative'),
('emotion', 'catharsis',   'Emotional release after tension',              'narrative'),
('emotion', 'tension',     'Anxious anticipation',                         'narrative'),
('emotion', 'relief',      'Release of tension',                           'narrative'),
('emotion', 'confusion',   'Disorientation, uncertainty',                  'narrative'),
('emotion', 'excitement',  'High energy engagement',                       'narrative'),
('emotion', 'frustration', 'Irritation with characters or plot',           'narrative'),
('emotion', 'satisfaction','Payoff, things going right',                   'narrative'),
('emotion', 'heartbreak',  'Sharp emotional pain',                         'narrative'),
('emotion', 'wonder',      'Curiosity, fascination',                       'narrative'),
('emotion', 'fear',        'Direct fear response',                         'narrative'),
('emotion', 'nostalgia',   'Longing for something past',                   'narrative'),
('emotion', 'numbness',    'Emotional exhaustion',                         'narrative'),
('character', '__open__', 'Named character. New values coined from content.', 'narrative'),
('relationship', 'rivalry',       'Competitive opposition',                'narrative'),
('relationship', 'mentorship',    'Teacher-student dynamic',               'narrative'),
('relationship', 'romance',       'Romantic connection or tension',        'narrative'),
('relationship', 'betrayal',      'A bond broken by treachery',            'narrative'),
('relationship', 'friendship',    'Platonic close bond',                   'narrative'),
('relationship', 'family',        'Blood or chosen family dynamics',       'narrative'),
('relationship', 'foil',          'Characters defined by contrast',        'narrative'),
('relationship', 'opposition',    'Fundamental conflict',                  'narrative'),
('relationship', 'found-family',  'Chosen bonds functioning as family',    'narrative'),
('plot', 'twist',           'Unexpected reversal',                         'narrative'),
('plot', 'revelation',      'Major information revealed',                  'narrative'),
('plot', 'death',           'A character dies',                            'narrative'),
('plot', 'battle',          'Combat or conflict sequence',                 'narrative'),
('plot', 'reunion',         'Separated characters reunite',                'narrative'),
('plot', 'sacrifice',       'A character gives something up',              'narrative'),
('plot', 'betrayal-event',  'The act of betrayal occurring',               'narrative'),
('plot', 'transformation',  'A character fundamentally changes',           'narrative'),
('plot', 'confrontation',   'Direct conflict between characters',          'narrative'),
('plot', 'discovery',       'Finding something new or hidden',             'narrative'),
('plot', 'escape',          'Characters flee or break free',               'narrative'),
('plot', 'loss',            'Something important is lost',                 'narrative'),
('trope', 'chosen-one',          'Protagonist destined for greatness',    'narrative'),
('trope', 'dead-mentor',         'Guide dies to motivate hero',           'narrative'),
('trope', 'redemption-arc',      'Villain seeks good',                    'narrative'),
('trope', 'villain-protagonist', 'Protagonist is moral antagonist',       'narrative'),
('trope', 'unreliable-narrator', 'Narrative voice cannot be trusted',     'narrative'),
('trope', 'chekhov-gun',         'Setup paid off later',                  'narrative'),
('trope', 'tragic-backstory',    'Trauma explaining current behavior',    'narrative'),
('trope', 'power-of-friendship', 'Bonds as source of strength',           'narrative'),
('trope', 'rivals-to-lovers',    'Antagonism becoming romance',           'narrative'),
('trope', 'slow-burn',           'Gradual development of tension',        'narrative'),
('trope', 'prophecy',            'Fate-driven narrative structure',       'narrative'),
('trope', 'subverted',           'The tagged trope is being inverted',    'narrative'),
('tone', 'dark',        'Grim, heavy, difficult content',                  'narrative'),
('tone', 'hopeful',     'Optimistic despite adversity',                    'narrative'),
('tone', 'bittersweet', 'Joy and sadness simultaneously',                  'narrative'),
('tone', 'comedic',     'Humorous, lighthearted',                          'narrative'),
('tone', 'tragic',      'Heading toward inevitable bad outcome',           'narrative'),
('tone', 'tense',       'Suspenseful, high stakes',                        'narrative'),
('tone', 'melancholic', 'Quiet sadness, reflective',                       'narrative'),
('tone', 'ominous',     'Foreboding',                                      'narrative'),
('tone', 'cathartic',   'Emotionally releasing',                           'narrative'),
('tone', 'satirical',   'Mocking or critiquing through exaggeration',      'narrative')
ON CONFLICT (namespace, name) DO NOTHING;--> statement-breakpoint

-- ============================================================
-- SEED: taxonomy (academic)
-- ============================================================
INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES
('claim', 'thesis',          'Central argument of the work',               'academic'),
('claim', 'hypothesis',      'A testable prediction',                      'academic'),
('claim', 'counterargument', 'An objection the author addresses',          'academic'),
('claim', 'assumption',      'Unstated premise the argument depends on',   'academic'),
('claim', 'conclusion',      'What the author concludes from evidence',    'academic'),
('claim', 'definition',      'How a term is being defined',                'academic'),
('claim', 'analogy',         'An argument by comparison',                  'academic'),
('claim', 'caveat',          'A qualification or limitation',              'academic'),
('evidence', 'empirical',    'Data from observation',                      'academic'),
('evidence', 'statistical',  'Numerical data and analysis',                'academic'),
('evidence', 'anecdotal',    'Single cases or stories',                    'academic'),
('evidence', 'citation',     'Reference to prior work',                    'academic'),
('evidence', 'case-study',   'Deep examination of one instance',           'academic'),
('evidence', 'experiment',   'Controlled study',                           'academic'),
('evidence', 'theoretical',  'Argument from first principles',             'academic'),
('evidence', 'historical',   'Evidence from past events',                  'academic'),
('evidence', 'comparative',  'Comparison across cases',                    'academic'),
('method', 'qualitative',       'Interpretive, non-numerical',             'academic'),
('method', 'quantitative',      'Numerical, statistical',                  'academic'),
('method', 'mixed',             'Both qualitative and quantitative',       'academic'),
('method', 'literature-review', 'Survey of existing research',             'academic'),
('method', 'meta-analysis',     'Statistical synthesis of studies',        'academic'),
('method', 'ethnographic',      'Field observation',                       'academic'),
('method', 'survey',            'Questionnaire-based data',                'academic'),
('method', 'experimental',      'Controlled variable manipulation',        'academic'),
('method', 'theoretical',       'Pure argument, no empirical component',   'academic'),
('method', 'case-study',        'Intensive study of one instance',         'academic'),
('concept', '__open__', 'Key term or named theory. New values from content.', 'academic'),
('discipline', 'economics',         'Economics and finance',               'academic'),
('discipline', 'philosophy',        'Philosophy and ethics',               'academic'),
('discipline', 'history',           'Historical scholarship',              'academic'),
('discipline', 'cs',                'Computer science',                    'academic'),
('discipline', 'psychology',        'Psychology and cognitive science',    'academic'),
('discipline', 'sociology',         'Sociology and social theory',         'academic'),
('discipline', 'biology',           'Biology and life sciences',           'academic'),
('discipline', 'political-science', 'Political science and IR',            'academic'),
('discipline', 'law',               'Legal studies',                       'academic'),
('discipline', 'anthropology',      'Anthropology',                        'academic'),
('discipline', 'linguistics',       'Linguistics and language',            'academic'),
('discipline', 'mathematics',       'Mathematics',                         'academic'),
('discipline', 'physics',           'Physics and hard science',            'academic'),
('discipline', 'education',         'Education research',                  'academic'),
('discipline', 'medicine',          'Medicine and public health',          'academic'),
('relation', 'supports',      'This reading supports another',             'academic'),
('relation', 'contradicts',   'This reading contradicts another',          'academic'),
('relation', 'extends',       'Builds on another work',                    'academic'),
('relation', 'critiques',     'Challenges another work',                   'academic'),
('relation', 'builds-on',     'Directly continues another work',           'academic'),
('relation', 'parallels',     'Similar argument by different path',        'academic'),
('relation', 'applies',       'Applies theory from another work',          'academic'),
('relation', 'responds-to',   'Explicit response to another work',         'academic'),
('relation', 'reframes',      'New frame for something already read',      'academic'),
('strength', 'strong-evidence', 'Well-supported, compelling',              'academic'),
('strength', 'weak-evidence',   'Thin or unconvincing support',            'academic'),
('strength', 'unsupported',     'Claim without evidence',                  'academic'),
('strength', 'well-argued',     'Sound logic regardless of evidence',      'academic'),
('strength', 'flawed',          'Identifiable logical error',              'academic'),
('strength', 'speculative',     'Plausible but not yet proven',            'academic'),
('strength', 'seminal',         'Foundational, widely cited',              'academic'),
('strength', 'contested',       'Disputed in the literature',              'academic'),
('question', 'open',             'Unanswered question',                    'academic'),
('question', 'gap',              'Missing research acknowledged',          'academic'),
('question', 'future-work',      'Directions the author suggests',         'academic'),
('question', 'answered',         'A question this reading answers',        'academic'),
('question', 'methodological',   'A question about research design',       'academic')
ON CONFLICT (namespace, name) DO NOTHING;--> statement-breakpoint

-- ============================================================
-- SEED: implications
-- ============================================================
INSERT INTO tag_implications (antecedent, consequent) VALUES
('type:quote',      'type:note'),
('type:summary',    'type:note'),
('type:prediction', 'type:note'),
('type:critique',   'type:analysis'),
('claim:thesis',    'type:analysis'),
('claim:conclusion','type:analysis')
ON CONFLICT (antecedent, consequent) DO NOTHING;--> statement-breakpoint

-- ============================================================
-- SEED: synonyms (starter set)
-- ============================================================
INSERT INTO tag_synonyms (alias, canonical_tag) VALUES
('sad',            'emotion:grief'),
('sadness',        'emotion:grief'),
('sorrow',         'emotion:grief'),
('sorrowful',      'emotion:grief'),
('happy',          'emotion:joy'),
('happiness',      'emotion:joy'),
('delight',        'emotion:joy'),
('angry',          'emotion:rage'),
('anger',          'emotion:rage'),
('fury',           'emotion:rage'),
('scared',         'emotion:fear'),
('terrified',      'emotion:fear'),
('nervous',        'emotion:tension'),
('anxious',        'emotion:tension'),
('heartbroken',    'emotion:heartbreak'),
('nostalgic',      'emotion:nostalgia'),
('amazed',         'emotion:awe'),
('surprised',      'emotion:awe'),
('relieved',       'emotion:relief'),
('frustrated',     'emotion:frustration'),
('satisfied',      'emotion:satisfaction'),
('found family',       'theme:found-family'),
('chosen family',      'theme:found-family'),
('nakama',             'theme:found-family'),
('coming of age',      'theme:coming-of-age'),
('growing up',         'theme:coming-of-age'),
('death',              'theme:mortality'),
('power struggle',     'theme:power'),
('moral corruption',   'theme:corruption'),
('family bonds',       'theme:found-family'),
('journal',      'type:reflection'),
('thought',      'type:reflection'),
('thoughts',     'type:reflection'),
('excerpt',      'type:quote'),
('passage',      'type:quote'),
('recap',        'type:summary'),
('review',       'type:critique'),
('theory',       'type:prediction'),
('theory craft', 'type:prediction'),
('main argument',     'claim:thesis'),
('central claim',     'claim:thesis'),
('central argument',  'claim:thesis'),
('data',              'evidence:empirical'),
('key term',          'concept:__open__'),
('terminology',       'concept:__open__'),
('definition',        'claim:definition')
ON CONFLICT (alias) DO NOTHING;
