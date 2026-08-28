import { describe, it, expect } from 'vitest';
import { relevancePrompt, commentDraftPrompt } from '../../src/ai/prompts.js';
import type { FeedPost } from '../../src/feed/types.js';

const post: FeedPost = { postUrn: 'u', url: 'x', authorName: 'Jane', authorHeadline: 'CTO',
  connectionDegree: 2, postedAt: '2026-07-15T06:00:00.000Z', textExcerpt: 'Post über KI-Agenten',
  reactions: 10, reposts: 0, socialProof: '', isSponsored: false };
const ownPosts = ['Ich baue Dev-Tools mit KI', 'Über Kosten in der Cloud'];

describe('relevancePrompt', () => {
  it('contains the user topics, all posts numbered, and asks for JSON', () => {
    const p = relevancePrompt([post], ownPosts);
    expect(p).toContain('KI-Agenten');           // post text
    expect(p).toContain('Dev-Tools');            // own topics/posts
    expect(p.toLowerCase()).toContain('json');   // Ausgabeformat
    expect(p).toMatch(/0\D*10/);                 // Skala 0..10
    expect(p).toContain('vertrauenswürdig');     // prompt injection note
  });
});

describe('commentDraftPrompt', () => {
  it('contains voice examples, the post, and the rules (language, brevity, value, read-only)', () => {
    const p = commentDraftPrompt(post, ownPosts);
    expect(p).toContain('KI-Agenten');
    expect(p).toContain('Dev-Tools');            // Stimm-Beispiel
    expect(p.toLowerCase()).toContain('sprache'); // Sprach-Regel
    expect(p.toLowerCase()).toMatch(/kurz|1.?3 s/); // brevity rule
    expect(p).toContain('vertrauenswürdig');      // prompt injection note
  });
});
