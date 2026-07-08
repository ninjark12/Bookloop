# Bookloop Tag Taxonomy
## Phase 1 Reference Document

This is the canonical taxonomy design for the Bookloop tagging system.
It covers all namespaces, controlled values, open namespaces, synonyms,
implications, and the seed SQL for the database.

Keep this file. It is the source of truth for:
- The Bedrock tagger Lambda prompt
- The tagTaxonomy seed SQL
- The search query parser namespace list
- Future SageMaker training label schema

---

## Design principles

**Namespaces are orthogonal dimensions.** An entry can have tags from multiple
namespaces simultaneously and they don't conflict. `theme:betrayal` and
`emotion:grief` and `character:griffith` on the same entry all mean different
things and combine multiplicatively in search.

**Controlled vs open namespaces.** Most namespaces have a fixed vocabulary
Bedrock picks from. A few (character:, concept:) are open -- Bedrock generates
new values from the entry content. Open namespaces need the synonym table more
urgently since the same character might be tagged "Guts", "Guts (Berserk)",
"the Black Swordsman" across different entries.

**Mode detection.** Bedrock auto-detects whether an entry is narrative or
academic based on content and applies the appropriate namespace subset.
The `mode:` tag is set automatically -- users don't set it manually.

**Entry type first.** The `type:` tag is the most important for search.
"Show me all my quotes" or "show me all my predictions" are the most common
queries. Bedrock should always set at least one `type:` tag.

---

## Schema

```sql
-- Enable pgvector (run once on Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- Canonical tag vocabulary
CREATE TABLE IF NOT EXISTS tag_taxonomy (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace    TEXT NOT NULL,
  name         TEXT NOT NULL,
  full_tag     TEXT GENERATED ALWAYS AS (namespace || ':' || name) STORED,
  description  TEXT,
  mode         TEXT NOT NULL DEFAULT 'any',   -- 'narrative', 'academic', 'any'
  is_open      BOOLEAN NOT NULL DEFAULT FALSE, -- true = Bedrock can coin new values
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, name)
);

CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_namespace ON tag_taxonomy (namespace);
CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_full_tag  ON tag_taxonomy (full_tag);
CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_mode      ON tag_taxonomy (mode);

-- Synonym -> canonical tag mapping
-- Bedrock output and user input are normalized through this table
CREATE TABLE IF NOT EXISTS tag_synonyms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias         TEXT NOT NULL UNIQUE,   -- e.g. 'sad', 'sadness', 'melancholy'
  canonical_tag TEXT NOT NULL,          -- e.g. 'emotion:grief'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tag_synonyms_alias ON tag_synonyms (alias);

-- Implications: when tag A is present, tag B is automatically added
CREATE TABLE IF NOT EXISTS tag_implications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  antecedent  TEXT NOT NULL,   -- e.g. 'type:quote'
  consequent  TEXT NOT NULL,   -- e.g. 'type:note'
  UNIQUE (antecedent, consequent)
);

-- Tags on individual journal entries
CREATE TABLE IF NOT EXISTS journal_entry_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,              -- full_tag string e.g. 'theme:betrayal'
  namespace  TEXT NOT NULL,             -- denormalized for fast namespace filtering
  name       TEXT NOT NULL,             -- denormalized
  source     TEXT NOT NULL DEFAULT 'bedrock',  -- 'bedrock' | 'user'
  verified   BOOLEAN NOT NULL DEFAULT FALSE,   -- user-touched = true (training signal)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_entry_tags_entry_id  ON journal_entry_tags (entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag        ON journal_entry_tags (tag);
CREATE INDEX IF NOT EXISTS idx_entry_tags_namespace  ON journal_entry_tags (namespace);
CREATE INDEX IF NOT EXISTS idx_entry_tags_verified   ON journal_entry_tags (verified);

-- GIN index for fast multi-tag search using array operators
-- Usage: WHERE tag = ANY(ARRAY['theme:betrayal', 'emotion:grief'])
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag_gin
  ON journal_entry_tags USING GIN (to_tsvector('english', tag));

-- Embedding vector on journal entries (add column if not exists)
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS embedding      vector(1024),
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending';
  -- processing_status: 'pending' | 'processing' | 'done' | 'failed'

-- HNSW index for approximate nearest-neighbour semantic search
-- Build after inserting enough vectors (>100) for it to be meaningful
CREATE INDEX IF NOT EXISTS idx_journal_entries_embedding
  ON journal_entries USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## Namespace reference

### Universal namespaces (apply to any entry)

---

#### type: (controlled, REQUIRED)
Every entry must have at least one type tag.
This is what most search queries start with.

| Tag | Description |
|-----|-------------|
| type:reflection | Personal reaction, thoughts, feelings about what was read |
| type:quote | Verbatim or near-verbatim text from the work |
| type:summary | Plot or argument recap, no original analysis |
| type:prediction | Guess about what happens next |
| type:critique | Critical analysis, disagreement, evaluation |
| type:connection | Links this entry to another book, entry, or real-world idea |
| type:question | An open question the reader wants answered |
| type:note | Catch-all short note, doesn't fit other types |
| type:analysis | Deeper structural or thematic breakdown |
| type:character-study | Entry focused on a character's arc or psychology |

---

#### mode: (controlled, auto-set by Bedrock)
Never user-set. Bedrock detects this from content.

| Tag | Description |
|-----|-------------|
| mode:narrative | Fiction, manga, graphic novels, creative nonfiction |
| mode:academic | Papers, textbooks, essays, research |
| mode:hybrid | Narrative nonfiction where both apply |

---

### Narrative namespaces (mode:narrative entries)

---

#### theme: (controlled)
What the story is exploring. An entry can have multiple theme tags.

| Tag | Description |
|-----|-------------|
| theme:betrayal | Trust broken between characters |
| theme:redemption | A character seeking or achieving forgiveness |
| theme:sacrifice | Giving up something of value for another |
| theme:power | Pursuit, abuse, or loss of power |
| theme:identity | Who a character is or is becoming |
| theme:loss | Death, separation, grief as a story driver |
| theme:found-family | Chosen bonds replacing or supplementing blood family |
| theme:revenge | Vengeance as motivation |
| theme:coming-of-age | Growth from youth to maturity |
| theme:war | Armed conflict and its consequences |
| theme:love | Romantic, familial, or platonic love |
| theme:mortality | Death, aging, impermanence |
| theme:freedom | Liberation, autonomy, escape from constraint |
| theme:justice | Fairness, law, punishment, moral reckoning |
| theme:isolation | Loneliness, exile, alienation |
| theme:corruption | Moral decay, institutions failing |
| theme:loyalty | Fidelity to people, ideals, or institutions |
| theme:hope | Optimism against adversity |
| theme:survival | Staying alive under extreme conditions |
| theme:fate | Destiny, prophecy, determinism vs free will |
| theme:ambition | Drive to achieve at any cost |
| theme:honor | Code of conduct, reputation, shame |
| theme:truth | Honesty, revelation, the nature of reality |
| theme:cycle | History repeating, generational patterns |
| theme:transformation | Fundamental change in a character or world |

---

#### emotion: (controlled)
How the reader felt while reading this entry's content.
Not the character's emotion -- the reader's.

| Tag | Description |
|-----|-------------|
| emotion:grief | Deep sadness, mourning |
| emotion:joy | Happiness, delight |
| emotion:rage | Anger, fury |
| emotion:dread | Anticipatory fear, unease |
| emotion:awe | Wonder, reverence |
| emotion:hope | Optimistic feeling |
| emotion:melancholy | Wistful sadness, bittersweet |
| emotion:catharsis | Emotional release, relief after tension |
| emotion:tension | Anxious anticipation |
| emotion:relief | Release of tension |
| emotion:confusion | Disorientation, uncertainty about plot or meaning |
| emotion:excitement | High energy engagement |
| emotion:frustration | Irritation, usually with characters or plot |
| emotion:satisfaction | Payoff, things going right |
| emotion:heartbreak | Sharp emotional pain |
| emotion:wonder | Curiosity, fascination |
| emotion:fear | Direct fear response |
| emotion:nostalgia | Longing for something past |
| emotion:numbness | Emotional exhaustion, too much happened |

---

#### character: (OPEN)
Named characters discussed in the entry. Bedrock extracts names from content.
New values coined freely -- not limited to a fixed list.
Synonyms table is important here for alternate names/titles.

Examples: character:griffith, character:guts, character:eren-yeager

Format rule: lowercase, hyphens for spaces, no punctuation.

---

#### relationship: (controlled)
The type of bond or dynamic being discussed.

| Tag | Description |
|-----|-------------|
| relationship:rivalry | Competitive opposition between characters |
| relationship:mentorship | Teacher-student or guide dynamic |
| relationship:romance | Romantic connection or tension |
| relationship:betrayal | A bond broken by treachery |
| relationship:friendship | Platonic close bond |
| relationship:family | Blood or chosen family dynamics |
| relationship:foil | Characters defined by contrast |
| relationship:opposition | Fundamental conflict between characters |
| relationship:redemption-arc | One character forgiving or being forgiven by another |
| relationship:found-family | Chosen bonds functioning as family |
| relationship:parasocial | Reader/narrator relationship with a character |

---

#### plot: (controlled)
Significant plot events happening in the chapters this entry covers.

| Tag | Description |
|-----|-------------|
| plot:twist | Unexpected reversal of expectations |
| plot:revelation | Major information revealed |
| plot:death | A character dies |
| plot:battle | Combat or conflict sequence |
| plot:reunion | Characters separated reunite |
| plot:sacrifice | A character gives something up |
| plot:betrayal-event | The actual act of betrayal (vs theme:betrayal) |
| plot:transformation | A character fundamentally changes |
| plot:confrontation | Direct conflict between characters |
| plot:discovery | Finding something new or hidden |
| plot:escape | Characters flee or break free |
| plot:loss | Something important is lost |

---

#### trope: (controlled)
Recognizable narrative patterns being used or subverted.

| Tag | Description |
|-----|-------------|
| trope:chosen-one | Protagonist destined for greatness |
| trope:dead-mentor | Guide character dies to motivate hero |
| trope:redemption-arc | Villain or flawed character seeks good |
| trope:villain-protagonist | Protagonist is the moral antagonist |
| trope:unreliable-narrator | The narrative voice cannot be trusted |
| trope:chekhov-gun | Setup paid off later |
| trope:tragic-backstory | Trauma explaining current behavior |
| trope:power-of-friendship | Bonds as the source of strength |
| trope:rivals-to-lovers | Antagonism becoming romance |
| trope:slow-burn | Gradual development of relationship or tension |
| trope:power-creep | Escalating power levels |
| trope:dark-lord | Evil absolute authority figure |
| trope:prophecy | Fate-driven narrative structure |
| trope:subverted | Used with another trope tag when the trope is being inverted |

---

#### tone: (controlled)
The narrative tone of the section covered by this entry.

| Tag | Description |
|-----|-------------|
| tone:dark | Grim, heavy, difficult content |
| tone:hopeful | Optimistic despite adversity |
| tone:bittersweet | Joy and sadness simultaneously |
| tone:comedic | Humorous, lighthearted |
| tone:tragic | Heading toward inevitable bad outcome |
| tone:tense | Suspenseful, high stakes |
| tone:melancholic | Quiet sadness, reflective |
| tone:ominous | Foreboding, something bad coming |
| tone:cathartic | Emotionally releasing |
| tone:satirical | Mocking or critiquing through exaggeration |

---

### Academic namespaces (mode:academic entries)

---

#### claim: (controlled)
The type of intellectual claim being made or noted.

| Tag | Description |
|-----|-------------|
| claim:thesis | The central argument of the work or section |
| claim:hypothesis | A testable prediction |
| claim:counterargument | An objection the author addresses |
| claim:assumption | An unstated premise the argument depends on |
| claim:conclusion | What the author concludes from evidence |
| claim:definition | How a term is being defined |
| claim:analogy | An argument by comparison |
| claim:caveat | A qualification or limitation acknowledged |

---

#### evidence: (controlled)
How the claim is supported.

| Tag | Description |
|-----|-------------|
| evidence:empirical | Data from observation or experiment |
| evidence:statistical | Numerical data and analysis |
| evidence:anecdotal | Single cases or stories |
| evidence:citation | References to prior work |
| evidence:case-study | Deep examination of one instance |
| evidence:experiment | Controlled study |
| evidence:theoretical | Argument from first principles |
| evidence:historical | Evidence from past events |
| evidence:comparative | Comparison across cases or groups |

---

#### method: (controlled)
The research or analytical method being used.

| Tag | Description |
|-----|-------------|
| method:qualitative | Interpretive, non-numerical |
| method:quantitative | Numerical, statistical |
| method:mixed | Both qualitative and quantitative |
| method:literature-review | Survey of existing research |
| method:meta-analysis | Statistical synthesis of multiple studies |
| method:ethnographic | Field observation and immersion |
| method:survey | Questionnaire-based data collection |
| method:experimental | Controlled manipulation of variables |
| method:theoretical | Pure argument, no empirical component |
| method:case-study | Intensive study of one instance |

---

#### concept: (OPEN)
Key terms, ideas, or named theories introduced or used.
Bedrock extracts these from entry content.
New values coined freely.

Examples: concept:opportunity-cost, concept:social-capital,
concept:hegemony, concept:black-swan

Format rule: lowercase, hyphens for spaces.

---

#### discipline: (controlled)
Academic field the work belongs to. An entry can have multiple.

| Tag | Description |
|-----|-------------|
| discipline:economics | Economics and finance |
| discipline:philosophy | Philosophy and ethics |
| discipline:history | Historical scholarship |
| discipline:cs | Computer science |
| discipline:psychology | Psychology and cognitive science |
| discipline:sociology | Sociology and social theory |
| discipline:biology | Biology and life sciences |
| discipline:political-science | Political science and IR |
| discipline:law | Legal studies |
| discipline:anthropology | Anthropology |
| discipline:linguistics | Linguistics and language |
| discipline:mathematics | Mathematics |
| discipline:physics | Physics and hard science |
| discipline:education | Education research |
| discipline:medicine | Medicine and public health |

---

#### relation: (controlled)
How this reading relates to other readings.
Bedrock sets this when the entry explicitly connects to prior knowledge.

| Tag | Description |
|-----|-------------|
| relation:supports | This reading supports another |
| relation:contradicts | This reading contradicts another |
| relation:extends | Builds on another work |
| relation:critiques | Challenges another work |
| relation:builds-on | Directly continues another work's ideas |
| relation:parallels | Similar argument by different path |
| relation:applies | Applies theory from another work |
| relation:responds-to | Written in explicit response to another work |
| relation:reframes | Gives new frame to something already read |

---

#### strength: (controlled)
Reader's assessment of the argument quality.

| Tag | Description |
|-----|-------------|
| strength:strong-evidence | Well-supported, compelling |
| strength:weak-evidence | Thin or unconvincing support |
| strength:unsupported | Claim made without evidence |
| strength:well-argued | Logic is sound regardless of evidence |
| strength:flawed | Identifiable logical error |
| strength:speculative | Plausible but not yet proven |
| strength:seminal | Foundational, widely cited |
| strength:contested | Disputed in the literature |

---

#### question: (controlled)
Status of a question raised in the entry.

| Tag | Description |
|-----|-------------|
| question:open | Unanswered question |
| question:gap | Missing research the author acknowledges |
| question:future-work | Directions the author suggests |
| question:answered | A question this reading answers |
| question:methodological | A question about research design |

---

## Implications table

When tag A is present, tag B is automatically added.
Applied server-side after Bedrock returns tags.

```
type:quote       => type:note
type:summary     => type:note
type:prediction  => type:note
type:critique    => type:analysis
plot:death       => emotion:grief        (suggested, not forced -- optional)
claim:thesis     => type:analysis
claim:conclusion => type:analysis
```

Note: plot/emotion implications are soft (suggested to Bedrock in the prompt,
not enforced server-side) because the reader's emotion to a death might not
be grief. Hard implications are only for entry type metadata.

---

## Synonym table (seed entries)

Key synonyms to pre-populate. The synonym table grows over time as users
correct tags and as you discover common Bedrock variations.

```
-- Emotion synonyms
sad, sadness, sorrow       => emotion:grief
happy, happiness, delight  => emotion:joy
angry, fury, anger         => emotion:rage
scared, terrified          => emotion:fear
surprised                  => emotion:awe
nervous, anxious           => emotion:tension
heartbroken                => emotion:heartbreak
nostalgic                  => emotion:nostalgia

-- Theme synonyms
family-bonds               => theme:found-family
found family               => theme:found-family
coming of age              => theme:coming-of-age
growing up                 => theme:coming-of-age
death                      => theme:mortality
survival horror            => theme:survival
power struggle             => theme:power
moral corruption           => theme:corruption

-- Type synonyms
journal                    => type:reflection
thought                    => type:reflection
excerpt                    => type:quote
recap                      => type:summary
spoiler-free summary       => type:summary
theory                     => type:prediction
review                     => type:critique

-- Academic synonyms
main argument              => claim:thesis
central claim              => claim:thesis
argument                   => claim:thesis
data                       => evidence:empirical
numbers                    => evidence:statistical
story                      => evidence:anecdotal
key term                   => concept (open -- needs name extracted)
definition                 => claim:definition
```

---

## Seed SQL

Paste into Supabase SQL editor to populate the taxonomy tables.

```sql
-- ============================================================
-- UNIVERSAL TAGS
-- ============================================================

INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES

-- type:
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

-- mode: (auto-set by Bedrock, never user-set)
('mode', 'narrative',  'Fiction, manga, graphic novels, creative nonfiction', 'any'),
('mode', 'academic',   'Papers, textbooks, essays, research',                 'any'),
('mode', 'hybrid',     'Narrative nonfiction',                                'any')

ON CONFLICT (namespace, name) DO NOTHING;

-- ============================================================
-- NARRATIVE TAGS
-- ============================================================

INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES

-- theme:
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

-- emotion:
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

-- character: OPEN
('character', '__open__', 'Named character. New values coined from content.', 'narrative'),

-- relationship:
('relationship', 'rivalry',       'Competitive opposition',                'narrative'),
('relationship', 'mentorship',    'Teacher-student dynamic',               'narrative'),
('relationship', 'romance',       'Romantic connection or tension',        'narrative'),
('relationship', 'betrayal',      'A bond broken by treachery',            'narrative'),
('relationship', 'friendship',    'Platonic close bond',                   'narrative'),
('relationship', 'family',        'Blood or chosen family dynamics',       'narrative'),
('relationship', 'foil',          'Characters defined by contrast',        'narrative'),
('relationship', 'opposition',    'Fundamental conflict',                  'narrative'),
('relationship', 'found-family',  'Chosen bonds functioning as family',    'narrative'),

-- plot:
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

-- trope:
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

-- tone:
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

ON CONFLICT (namespace, name) DO NOTHING;

-- ============================================================
-- ACADEMIC TAGS
-- ============================================================

INSERT INTO tag_taxonomy (namespace, name, description, mode) VALUES

-- claim:
('claim', 'thesis',          'Central argument of the work',               'academic'),
('claim', 'hypothesis',      'A testable prediction',                      'academic'),
('claim', 'counterargument', 'An objection the author addresses',          'academic'),
('claim', 'assumption',      'Unstated premise the argument depends on',   'academic'),
('claim', 'conclusion',      'What the author concludes from evidence',    'academic'),
('claim', 'definition',      'How a term is being defined',                'academic'),
('claim', 'analogy',         'An argument by comparison',                  'academic'),
('claim', 'caveat',          'A qualification or limitation',              'academic'),

-- evidence:
('evidence', 'empirical',    'Data from observation',                      'academic'),
('evidence', 'statistical',  'Numerical data and analysis',                'academic'),
('evidence', 'anecdotal',    'Single cases or stories',                    'academic'),
('evidence', 'citation',     'Reference to prior work',                    'academic'),
('evidence', 'case-study',   'Deep examination of one instance',           'academic'),
('evidence', 'experiment',   'Controlled study',                           'academic'),
('evidence', 'theoretical',  'Argument from first principles',             'academic'),
('evidence', 'historical',   'Evidence from past events',                  'academic'),
('evidence', 'comparative',  'Comparison across cases',                    'academic'),

-- method:
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

-- concept: OPEN
('concept', '__open__', 'Key term or named theory. New values from content.', 'academic'),

-- discipline:
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

-- relation:
('relation', 'supports',      'This reading supports another',             'academic'),
('relation', 'contradicts',   'This reading contradicts another',          'academic'),
('relation', 'extends',       'Builds on another work',                    'academic'),
('relation', 'critiques',     'Challenges another work',                   'academic'),
('relation', 'builds-on',     'Directly continues another work',           'academic'),
('relation', 'parallels',     'Similar argument by different path',        'academic'),
('relation', 'applies',       'Applies theory from another work',          'academic'),
('relation', 'responds-to',   'Explicit response to another work',         'academic'),
('relation', 'reframes',      'New frame for something already read',      'academic'),

-- strength:
('strength', 'strong-evidence', 'Well-supported, compelling',              'academic'),
('strength', 'weak-evidence',   'Thin or unconvincing support',            'academic'),
('strength', 'unsupported',     'Claim without evidence',                  'academic'),
('strength', 'well-argued',     'Sound logic regardless of evidence',      'academic'),
('strength', 'flawed',          'Identifiable logical error',              'academic'),
('strength', 'speculative',     'Plausible but not yet proven',            'academic'),
('strength', 'seminal',         'Foundational, widely cited',              'academic'),
('strength', 'contested',       'Disputed in the literature',              'academic'),

-- question:
('question', 'open',             'Unanswered question',                    'academic'),
('question', 'gap',              'Missing research acknowledged',          'academic'),
('question', 'future-work',      'Directions the author suggests',         'academic'),
('question', 'answered',         'A question this reading answers',        'academic'),
('question', 'methodological',   'A question about research design',       'academic')

ON CONFLICT (namespace, name) DO NOTHING;

-- ============================================================
-- IMPLICATIONS
-- ============================================================

INSERT INTO tag_implications (antecedent, consequent) VALUES
('type:quote',      'type:note'),
('type:summary',    'type:note'),
('type:prediction', 'type:note'),
('type:critique',   'type:analysis'),
('claim:thesis',    'type:analysis'),
('claim:conclusion','type:analysis')
ON CONFLICT (antecedent, consequent) DO NOTHING;

-- ============================================================
-- KEY SYNONYMS (starter set -- grows over time)
-- ============================================================

INSERT INTO tag_synonyms (alias, canonical_tag) VALUES
-- emotion
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
-- theme
('found family',       'theme:found-family'),
('chosen family',      'theme:found-family'),
('nakama',             'theme:found-family'),
('coming of age',      'theme:coming-of-age'),
('growing up',         'theme:coming-of-age'),
('death',              'theme:mortality'),
('power struggle',     'theme:power'),
('moral corruption',   'theme:corruption'),
('family bonds',       'theme:found-family'),
-- type
('journal',      'type:reflection'),
('thought',      'type:reflection'),
('thoughts',     'type:reflection'),
('excerpt',      'type:quote'),
('passage',      'type:quote'),
('recap',        'type:summary'),
('review',       'type:critique'),
('theory',       'type:prediction'),
('theory craft', 'type:prediction'),
-- academic
('main argument',     'claim:thesis'),
('central claim',     'claim:thesis'),
('central argument',  'claim:thesis'),
('data',              'evidence:empirical'),
('key term',          'concept:__open__'),
('terminology',       'concept:__open__'),
('definition',        'claim:definition')
ON CONFLICT (alias) DO NOTHING;
```

---

## Open namespace rules for Bedrock prompt

When instructing Bedrock to tag an entry, include these rules for open namespaces:

```
For character: tags:
- Extract named characters directly discussed in the entry
- Format: character:<name> where name is lowercase with hyphens
- Include only characters the reader is writing about, not every character mentioned
- Examples: character:guts, character:griffith, character:eren-yeager

For concept: tags (academic mode only):
- Extract key terms, named theories, or important concepts being defined or discussed
- Format: concept:<term> where term is lowercase with hyphens
- Include only concepts the reader is actively engaging with
- Examples: concept:opportunity-cost, concept:social-capital, concept:hegemony
```

---

## Query parser namespace list

The search query parser needs to know all valid namespaces to correctly
identify booru-style tags vs natural language terms.

```typescript
export const VALID_NAMESPACES = [
  'type', 'mode',
  // narrative
  'theme', 'emotion', 'character', 'relationship', 'plot', 'trope', 'tone',
  // academic
  'claim', 'evidence', 'method', 'concept', 'discipline', 'relation',
  'strength', 'question',
] as const;

export type Namespace = typeof VALID_NAMESPACES[number];

// Open namespaces -- any value after the colon is valid
export const OPEN_NAMESPACES: Namespace[] = ['character', 'concept'];
```

---

## Bedrock tagger prompt template

When building the Lambda, use this as the system prompt base:

```
You are a reading journal tagger. Given a journal entry, extract structured
tags from the taxonomy below. Return ONLY a JSON object with a "tags" array.

Rules:
- Always include exactly one mode: tag (narrative or academic or hybrid)
- Always include at least one type: tag
- For narrative entries: include theme:, emotion:, and character: tags where present
- For academic entries: include claim:, evidence:, and concept: tags where present
- Use only tags from the controlled vocabulary lists below
- For open namespaces (character:, concept:), generate values from the content
- Format open namespace values as lowercase with hyphens, no punctuation
- Do not invent new values for controlled namespaces
- Maximum 12 tags total per entry
- Prefer specific tags over general ones

Controlled vocabulary:
[INJECT full taxonomy here from tag_taxonomy table]

Return format:
{
  "tags": ["mode:narrative", "type:reflection", "theme:betrayal", "emotion:grief", "character:griffith"],
  "mode": "narrative"
}
```
