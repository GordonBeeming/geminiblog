import type { APIRoute } from 'astro';
import { SITE, url, isoDate } from '../consts';
import { getPublishedPosts } from '../lib/posts';

export const GET: APIRoute = async () => {
	const posts = await getPublishedPosts();
	const staticPages = ['/', '/about/', '/blog/', '/tags/', '/evolution/'];

	const staticEntries = staticPages
		.map(
			(page) => `  <url>
    <loc>${SITE.origin}${url(page)}</loc>
  </url>`,
		)
		.join('\n');

	const postEntries = posts
		.map(
			(post) => `  <url>
    <loc>${SITE.origin}${url(`/blog/${post.id}/`)}</loc>
    <lastmod>${isoDate(post.data.date)}</lastmod>
  </url>`,
		)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${postEntries}
</urlset>
`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
		},
	});
};
