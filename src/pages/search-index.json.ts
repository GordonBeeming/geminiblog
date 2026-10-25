import type { APIRoute } from 'astro';
import { isoDate } from '../consts';
import {
	getPublishedPosts,
	getEntryNumberMap,
	formatEntryNumber,
	essayBody,
	extractSignOff,
	extractSiteChange,
} from '../lib/posts';

export const GET: APIRoute = async () => {
	const posts = await getPublishedPosts();
	const entryMap = getEntryNumberMap(posts);
	const payload = posts.map((post) => ({
		slug: post.id,
		entryNumber: formatEntryNumber(entryMap.get(post.id) ?? 1),
		title: post.data.title,
		description: post.data.description,
		date: isoDate(post.data.date),
		category: post.data.category,
		tags: post.data.tags,
		signOff: extractSignOff(post.body),
		siteChange: extractSiteChange(post.body),
		body: essayBody(post.body).replace(/\s+/g, ' ').trim(),
	}));

	return new Response(JSON.stringify(payload), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
};
