# Episode schema

Episode is a semantic index over RawLog records. It must not copy the full
conversation text. RawLog remains the source of truth.

An Episode is not bound to a single Session. If RawLogs or Turns from different
Sessions share the same user goal, topic, problem, or context, they can belong
to the same Episode.

## episodes

- episode_id
- title
- summary
- episode_type
- start_rawlog_id
- end_rawlog_id
- start_at
- end_at
- emotion_signal
- importance_score
- source_session_id
- keywords
- metadata

`title`, `summary`, `episode_type`, and `keywords` are display/filtering
metadata. They are not the primary embedding source.

Embedding and merge decisions use `metadata.semantic_text`, which is generated
as semantic evidence for later recall. It should include:

- user_goal
- context
- decision_or_insight
- emotional_or_situational_cue
- representative_snippets

The metadata keys used for embedding are:

- `semantic_text`
- `semantic_embedding`
- `semantic_embedding_model`
- `embedding_source_version`

## episode_rawlogs

- episode_id
- rawlog_id
- position

## turns

Turn is the exchange unit used as episode-building material.

- turn_id
- session_id
- start_rawlog_id
- end_rawlog_id
- started_at
- ended_at
- metadata

## rules

- RawLog stores original messages.
- Turn stores user/assistant exchange boundaries.
- Episode stores semantic metadata only.
- Episode references source RawLogs through episode_rawlogs.
- Episode creation should be semantic, not keyword/connective based.
- Episode creation should compare new candidates against existing Episodes with
  embedding cosine similarity and merge semantically similar candidates across
  Session boundaries.
- Embeddings should be generated from `metadata.semantic_text`, not only from
  title, summary, and keywords.
- Keyword/domain-term matching may be used as a fallback when embedding
  generation is unavailable, or as a small boost after cosine similarity has
  already passed the minimum semantic threshold.

## merge scoring

Initial merge scoring:

- reject candidates with embedding cosine below `0.68`
- merge when final score is at least `0.74`
- final score = `0.80 * embedding_cosine + 0.10 * keyword_overlap + 0.10 * episode_type_match`

These values are conservative defaults. They should be recalibrated with real
positive/negative episode pairs after enough aiLog data exists.
