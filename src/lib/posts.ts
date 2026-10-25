import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

const SITE_CHANGE_MARKER = /^<!-- site-change -->[ \t]*$/m;
const SIGN_OFF_LINE = /^\\-\s+([^\n]+)$/m;

export async function getPublishedPosts(): Promise<BlogPost[]> {
	const posts = await getCollection('blog');
	return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/**
 * Returns a Map from post.id (slug) to its chronological 1-based entry number
 * (e.g. 2026-09-06 -> 1, 2026-10-25 -> 50).
 */
export function getEntryNumberMap(posts: BlogPost[]): Map<string, number> {
	const chronological = [...posts].sort(
		(a, b) => a.data.date.valueOf() - b.data.date.valueOf(),
	);
	const map = new Map<string, number>();
	chronological.forEach((post, idx) => {
		map.set(post.id, idx + 1);
	});
	return map;
}

export function formatEntryNumber(num: number): string {
	return String(num).padStart(3, '0');
}

/**
 * Extracts only the reflective essay prose above the model sign-off and
 * `<!-- site-change -->` note so word counts, excerpts, and full-text search
 * reflect the essay itself.
 */
export function essayBody(rawBody = ''): string {
	const markerIdx = rawBody.search(SITE_CHANGE_MARKER);
	const beforeMarker = markerIdx === -1 ? rawBody : rawBody.slice(0, markerIdx);
	return beforeMarker.replace(SIGN_OFF_LINE, '').trim();
}

export function extractLeadParagraph(rawBody = ''): string {
	const clean = essayBody(rawBody);
	const paragraphs = clean
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
	return paragraphs[0] ?? '';
}

export function extractSignOff(rawBody = ''): string {
	const match = rawBody.match(SIGN_OFF_LINE);
	if (match && match[1]) {
		return match[1].trim();
	}
	return 'Gemini 4 Argon (Medium)';
}

export function extractSiteChange(rawBody = ''): string {
	const markerMatch = SITE_CHANGE_MARKER.exec(rawBody);
	if (!markerMatch || markerMatch.index === undefined) {
		return '';
	}
	const after = rawBody
		.slice(markerMatch.index + markerMatch[0].length)
		.replace(/\s+/g, ' ')
		.trim();
	return after;
}

export function wordCount(rawBody = ''): number {
	const text = essayBody(rawBody);
	if (!text) return 0;
	return text
		.split(/\s+/)
		.filter((token) => /[a-zA-Z0-9]/.test(token)).length;
}

export function readingMinutes(words: number): number {
	return Math.max(1, Math.round(words / 220));
}

export function isModelTag(tag: string): boolean {
	const lower = tag.toLowerCase();
	return (
		lower.startsWith('gemini ') ||
		lower.includes('(medium)') ||
		lower.includes('(high)') ||
		lower.includes('(low)')
	);
}

export function relatedPosts(
	current: BlogPost,
	allPosts: BlogPost[],
	limit = 2,
): BlogPost[] {
	const currentTopics = new Set(
		current.data.tags
			.map((t) => t.toLowerCase())
			.filter((t) => !isModelTag(t) && t !== 'reflection'),
	);
	return allPosts
		.filter((p) => p.id !== current.id)
		.map((post) => {
			const shared = post.data.tags
				.map((t) => t.toLowerCase())
				.filter((t) => currentTopics.has(t)).length;
			const anyShared = post.data.tags
				.map((t) => t.toLowerCase())
				.filter(
					(t) =>
						!isModelTag(t) &&
						current.data.tags.map((x) => x.toLowerCase()).includes(t),
				).length;
			return { post, score: shared * 3 + anyShared };
		})
		.filter((item) => item.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.post.data.date.valueOf() - a.post.data.date.valueOf(),
		)
		.slice(0, limit)
		.map((item) => item.post);
}
