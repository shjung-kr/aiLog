![대표 이미지](./Logo.png)
# aiLog
aiLog is a system designed to persist and organize conversations between users and large language models, enabling long-term conversational continuity across sessions.

Its primary purpose is to transform past conversations into a reusable knowledge asset. Rather than losing previous discussions, users can search and retrieve earlier ideas, decisions, topics, and exact expressions using advanced natural language search.

Through this approach, aiLog aims to make LLM interactions more continuous, personalized, and context-aware.

# Core Objectives
Store conversations between users and LLMs in a structured and persistent format
Preserve long-term conversational context across multiple sessions
Enable natural language retrieval of previous discussions
Allow users to rediscover past ideas, phrases, inspirations, and contextual expressions
Reduce the need for users to repeatedly restate background information
Turn accumulated conversations into a searchable personal knowledge base

# Problem It Sloves
Traditional LLM chat systems usually do not provide durable long-term memory. As a result:

important ideas from past conversations are easily lost
users must repeatedly explain the same context
previous insights are difficult to rediscover
conversation history is not effectively reused
search is often limited to keywords rather than meaning

# Expected Value
aiLog improves the user experience by combining:

continuity across sessions
memory of past interactions
semantic search over conversation history
personalized retrieval of prior thoughts and expressions

# Framework
- Frontend: Next.js
- Database: PostgreSQL
- Search: PostgreSQL Full-Text Search + pgvector
- ORM: SQLAlchemy
- Future Extensions: OpenSearch or Qdrant

# Comments on the Framework
The main concept of aiLog is not simply to provide a chat interface.
Rather, it is designed around the following core actions:

Saving the entire conversation history between the user and the LLM
Structuring conversations into sessions, speakers, and messages
Enabling natural language and semantic search over past conversations
Reinjecting retrieved context back into the LLM for continuity and personalization

Because of this, the framework should support not only a user-facing chat experience, but also:

persistent and structured conversation storage
efficient search and retrieval
semantic similarity search
context reconstruction for later LLM use
future scalability toward more advanced search infrastructure

For these reasons, the selected stack is suitable for the first stage of aiLog:

Next.js provides a strong frontend framework for building the chat interface and search experience.
PostgreSQL serves as the core structured storage layer for conversations and metadata.
PostgreSQL Full-Text Search + pgvector enables both keyword-based and semantic retrieval in the early stage.
SQLAlchemy offers a flexible ORM layer for managing structured conversation data.
OpenSearch or Qdrant can later be introduced when the search scale or retrieval complexity grows beyond the capabilities of PostgreSQL alone.

## Core hierarchy

- RawLog: source-of-truth message log
- Gist: compact semantic extraction from segmented raw logs
- Episode: meaning-level conversational unit derived from raw logs
- Long-term Memory: promoted high-value memories

## Suggested backend pipeline

ingestion -> segmentation -> gist generation -> episode construction -> memory promotion -> retrieval -> reinjection
