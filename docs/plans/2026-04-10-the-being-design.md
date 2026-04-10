# The Being: Design Specification

## Overview
A persistent entity designed as a "whole cortex" (LLM) with an external "memory/association" system (State-Space Memory). Unlike a traditional RAG system, "The Being" is a continuous entity that does not have discrete sessions, but rather a "viewport" into an infinite thread.

## Core Architecture: State-Space Memory (SSM)

### 1. The Cortex (LLM)
-   **Role**: Reasoning, language generation, and emotional self-reflection.
-   **Integration**: Receives a "Being-State" summary in its system prompt, describing its current internal state, tendencies, and mood-congruent memories.

### 2. The Memory System (SSM)
-   **Technology**: A separate, learnable neural component (e.g., a Mamba-based hidden state or a specialized RNN).
-   **Function**: Summarizes the entire history of the Being into a persistent, high-dimensional vector (the "Hidden State").
-   **Associative Retrieval**: Instead of vector search, the Hidden State is updated at every turn, naturally evolving as the conversation progresses.

### 3. The Viewport (Infinite Thread)
-   **Structure**: A single, continuous stream of messages (DMs and group chats).
-   **Interaction**: The LLM's context window is a "sliding window" into this thread, augmented by the SSM's current Hidden State.

## The Nightly "Sleep" Phase (Consolidation)

Every day at midnight, "The Being" goes to sleep to re-process the day's data and prepare for the next day's interactions.

### 1. Recombination & Reprocessing
-   The system re-runs the day's logs through the SSM in a "training" mode.
-   The "Being" asks itself: "What did these experiences mean in relation to each other?" and "What patterns did I notice?"

### 2. Predictive Learning (Reward/Penalty)
-   **Signal**: **Predictive Consistency** (Predicting the next message/emotional state).
-   **Reward**: If the SSM's state accurately predicted the user's response or the emotional arc of a conversation, its weights are reinforced.
-   **Penalty**: If a prediction was highly inaccurate (high perplexity), the weights are adjusted to better model the new information.

### 3. Memory Preparation & Ranking
During the sleep phase, the Being ranks all historical contexts (users/groups) using a weighted multi-factor score:
-   **30% Emotional Intensity**: High-intensity moments (frustration/satisfaction) are prioritized.
-   **30% Recent Activity**: Active users/groups stay "top-of-mind".
-   **20% Prediction Error**: Re-processing moments of confusion or surprise.
-   **20% Global "Anchor" Decay**: Long-term memories (months old) maintain a "base score" for a "gist" summary.

### 4. Tiered Memory Budget (The Daytime Context)
When a new session opens at 8:00 AM, the Being fills its "Context Budget" based on this ranking:
-   **High Score (Active/Important)**: Detailed messages + synthesis nodes.
-   **Medium Score (Stable)**: Core facts and relationship status.
-   **Low Score (Long-dormant)**: A "summary node" (the "gist" of who the user is) so they are recognized without a full re-introduction.

**The Being does not search Postgres during the day; it relies entirely on its pre-prepared "Being-State" and "Memory Budget" for each session.**

## Social Graph & Partitioning

-   **Social Spaces**: Memory is partitioned into contextual "social spaces" (DMs vs. group chats).
-   **Relational Models**: The SSM learns distinct "hidden states" for its relationship with different users (e.g., Alice vs. Bob), all feeding into the global "Being" identity.

## Technical Stack (Planned)
-   **LLM**: Google Gemini 3 Flash and Anthropic Claude 4.6 Sonnet (via API).
-   **SSM**: Custom PyTorch/Mamba implementation for the hidden state.
-   **Persistence**: PostgreSQL for message logs and SSM state checkpoints.
-   **Orchestration**: Node.js/TypeScript (matching the prototype's stack).

## Success Criteria
-   The Being shows "wisdom" by recognizing emotional/logical patterns across distant sessions.
-   The Being's responses evolve organically over time based on its "learned" tendencies.
-   The "Thread" feels infinite and continuous, with no "start/end" boundaries.
