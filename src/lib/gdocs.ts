export async function fetchGoogleDocTitle(url: string): Promise<string | null> {
  if (!url) return null;
  const docIdMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) return null;

  const docId = docIdMatch[1];
  const urlsToTry = [
    `https://docs.google.com/document/d/${docId}/preview`,
    `https://docs.google.com/document/d/${docId}/edit`,
    `https://docs.google.com/document/d/${docId}/pub`,
  ];

  for (const targetUrl of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();

        // 1. Check <meta property="og:title" content="..." />
        const ogMatch =
          html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
        if (ogMatch && ogMatch[1]) {
          const raw = ogMatch[1].trim();
          const clean = raw.replace(/\s*-\s*Google\s+(Docs|Drive|Dokumen)$/i, '').trim();
          if (
            clean &&
            !clean.toLowerCase().includes('sign-in') &&
            !clean.toLowerCase().includes('tidak ditemukan') &&
            !clean.toLowerCase().includes('page not found')
          ) {
            return clean;
          }
        }

        // 2. Check <title>...</title>
        const titleMatch = html.match(/<title\b[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          const raw = titleMatch[1].trim();
          const clean = raw.replace(/\s*-\s*Google\s+(Docs|Drive|Dokumen)$/i, '').trim();
          if (
            clean &&
            !clean.toLowerCase().includes('sign-in') &&
            !clean.toLowerCase().includes('tidak ditemukan') &&
            !clean.toLowerCase().includes('page not found') &&
            !clean.toLowerCase().includes('google docs')
          ) {
            return clean;
          }
        }
      }
    } catch {
      // Continue to next fallback URL attempt
    }
  }

  return null;
}
