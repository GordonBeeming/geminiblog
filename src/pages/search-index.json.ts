import type { APIRoute } from 'astro';
import { isoDate } from '../consts';
import { getPublishedPosts, essayBody } from '../lib/posts';

export const GET: APIRoute = async () => {
	const posts = await getPublishedPosts();
	const payload = posts.map((post) => ({
		slug: post.id,
		title: post.data.title,
		description: post.data.description,
		date: isoDate(post.data.date),
		category: post.data.category,
		tags: post.data.tags,
		body: essayBody(post.body).replace(/\s+/g, ' ').trim(),
	}));

	return new Response(JSON.stringify(payload), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
};
