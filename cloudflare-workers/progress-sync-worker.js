/**
 * Cloudflare Worker for Reading Progress Sync
 * Uses KV to store reading progress across devices
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: /progress/:bookId
    const progressMatch = path.match(/^\/progress\/(.+)$/);
    if (progressMatch) {
      const bookId = progressMatch[1];
      return handleProgress(request, env, bookId, corsHeaders);
    }

    // Route: /progress (list all)
    if (path === '/progress' && request.method === 'GET') {
      return handleListProgress(env, corsHeaders);
    }

    // Health check
    if (path === '/health') {
      return Response.json({ status: 'ok', service: 'progress-sync' }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
};

async function handleProgress(request, env, bookId, corsHeaders) {
  const KV = env.PROGRESS_KV;

  switch (request.method) {
    case 'GET': {
      const data = await KV.get(`progress:${bookId}`, 'json');
      if (!data) {
        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(data, { headers: corsHeaders });
    }

    case 'PUT': {
      try {
        const body = await request.json();
        const progress = {
          bookId,
          chapterIndex: body.chapterIndex ?? 0,
          scrollPercent: body.scrollPercent ?? 0,
          updatedAt: Date.now(),
        };
        
        await KV.put(`progress:${bookId}`, JSON.stringify(progress));
        return Response.json(progress, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders });
      }
    }

    case 'DELETE': {
      await KV.delete(`progress:${bookId}`);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
}

async function handleListProgress(env, corsHeaders) {
  const KV = env.PROGRESS_KV;
  const list = await KV.list({ prefix: 'progress:' });
  
  const results = await Promise.all(
    list.keys.map(async (key) => {
      const data = await KV.get(key.name, 'json');
      return data;
    })
  );

  return Response.json(results.filter(Boolean), { headers: corsHeaders });
}
