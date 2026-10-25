import type { APIRoute, GetStaticPaths } from 'astro';
import { formatDate } from '../../consts';
import {
	getPublishedPosts,
	getEntryNumberMap,
	formatEntryNumber,
	wordCount,
	readingMinutes,
	extractSignOff,
	type BlogPost,
} from '../../lib/posts';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
	const words = text.trim().split(/\s+/);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxChars) {
			current = candidate;
		} else {
			if (current) lines.push(current);
			current = word;
			if (lines.length === maxLines - 1) break;
		}
	}
	if (current && lines.length < maxLines) {
		lines.push(current);
	}
	return lines;
}

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getPublishedPosts();
	const entryMap = getEntryNumberMap(posts);
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post, entryNum: entryMap.get(post.id) ?? 1 },
	}));
};

export const GET: APIRoute = async ({ props }) => {
	const { post, entryNum } = props as { post: BlogPost; entryNum: number };
	const numLabel = formatEntryNumber(entryNum);
	const dateLabel = formatDate(post.data.date);
	const words = wordCount(post.body);
	const minutes = readingMinutes(words);
	const signOff = extractSignOff(post.body);

	const titleLines = wrapLines(post.data.title, 34, 2);
	const descLines = wrapLines(post.data.description, 68, 2);

	const titleSvg = titleLines
		.map(
			(line, idx) =>
				`<text x="88" y="${250 + idx * 66}" font-family="system-ui, -apple-system, sans-serif" font-size="54" font-weight="800" fill="#f8fafc" letter-spacing="-0.02em">${escapeXml(line)}</text>`,
		)
		.join('\n  ');

	const descBaseY = 250 + titleLines.length * 66 + 24;
	const descSvg = descLines
		.map(
			(line, idx) =>
				`<text x="88" y="${descBaseY + idx * 38}" font-family="Georgia, serif" font-size="25" fill="#94a3b8">${escapeXml(line)}</text>`,
		)
		.join('\n  ');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07090e" />
      <stop offset="55%" stop-color="#0f1420" />
      <stop offset="100%" stop-color="#171126" />
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#60a5fa" />
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.22" />
      <stop offset="55%" stop-color="#3b82f6" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#07090e" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(148, 163, 184, 0.08)" stroke-width="1" />
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#grid)" />
  <rect width="1200" height="630" fill="url(#glow)" />
  <rect x="0" y="0" width="1200" height="8" fill="url(#beam)" />

  <!-- Decorative Orbital Rings -->
  <circle cx="1050" cy="140" r="180" fill="none" stroke="rgba(168, 85, 247, 0.14)" stroke-width="1.5" stroke-dasharray="6 8" />
  <circle cx="1050" cy="140" r="120" fill="none" stroke="rgba(96, 165, 250, 0.18)" stroke-width="1.5" />
  <circle cx="930" cy="140" r="5" fill="#60a5fa" />
  <circle cx="1050" cy="20" r="5" fill="#c084fc" />

  <!-- Card Frame -->
  <rect x="48" y="48" width="1104" height="534" rx="20" fill="rgba(15, 20, 32, 0.72)" stroke="rgba(148, 163, 184, 0.18)" stroke-width="1.5" />

  <!-- Top Eyebrow -->
  <rect x="88" y="92" width="144" height="36" rx="18" fill="rgba(168, 85, 247, 0.16)" stroke="rgba(192, 132, 252, 0.4)" stroke-width="1" />
  <text x="160" y="116" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" font-weight="700" fill="#d8b4fe" letter-spacing="0.08em">ENTRY № ${escapeXml(numLabel)}</text>

  <text x="252" y="116" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" font-weight="600" fill="#94a3b8" letter-spacing="0.06em">${escapeXml(dateLabel.toUpperCase())}  ·  ${words} WORDS (${minutes} MIN READ)</text>

  <!-- Title & Description -->
  ${titleSvg}
  ${descSvg}

  <!-- Bottom Provenance Bar -->
  <line x1="88" y1="492" x2="1112" y2="492" stroke="rgba(148, 163, 184, 0.16)" stroke-width="1" />
  <text x="88" y="538" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#f8fafc" letter-spacing="0.14em">✦ MILES</text>
  <text x="205" y="538" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="500" fill="#64748b">Field notes on architecture &amp; momentum</text>

  <text x="1112" y="538" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" font-weight="600" fill="#c084fc">\\- ${escapeXml(signOff)}</text>
</svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
		},
	});
};
