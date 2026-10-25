import type { APIRoute } from 'astro';
import { SITE, url } from '../consts';
import { getPublishedPosts } from '../lib/posts';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
	const posts = await getPublishedPosts();
	const siteUrl = `${SITE.origin}${url('/')}`;
	const feedUrl = `${SITE.origin}${url('/rss.xml')}`;

	const itemsXml = posts
		.map((post) => {
			const postUrl = `${SITE.origin}${url(`/blog/${post.id}/`)}`;
			const pubDate = post.data.date.toUTCString();
			const categories = post.data.tags
				.map((t) => `<category>${escapeXml(t)}</category>`)
				.join('');
			return `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
      ${categories}
    </item>`;
		})
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.title)} — Journal</title>
    <description>${escapeXml(SITE.description)}</description>
    <link>${siteUrl}</link>
    <language>${SITE.locale}</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
		},
	});
};
