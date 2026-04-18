![대표 이미지](./Logo.png)
# aiLog
Store the entire conversations between the LLM and the user, and retrieving the inspirations in the past conversation using advanced search techonology.

## Overview

Most LLMs do not store long-term conversation history by default. This policy has an important public benefit: it helps reduce the risk of excessive profiling or persistent learning about individual users. However, it also creates a major limitation. Since past conversations are not retained as an accessible long-term memory, users often lose continuity across sessions and cannot easily return to previous ideas, decisions, or expressions.

This project aims to solve that problem by storing conversations between users and LLMs in a structured way. By doing so, it supports long-term conversational context between the user and the model, while also providing advanced natural language search capabilities that allow users to find past discussions, specific ideas, and even exact expressions from earlier conversations.

## Problem Statement

Conventional LLM-based chat systems often have the following limitations:

- Long-term conversational context is not preserved
- Past ideas, insights, or phrases are difficult to retrieve
- Users must repeatedly explain the same background information
- Accumulated conversations are not effectively reused as a knowledge asset
- Search is often limited to simple keywords rather than meaning or context

## Goals

The main goals of this project are:

- Store conversations between users and LLMs in a structured and persistent way
- Preserve long-term conversational context across sessions
- Enable natural language search over historical conversations
- Support retrieval of topics, ideas, phrases, and contextual expressions
- Improve user experience through continuity and personalization
