/**
 * Cloudflare Worker for Bookshelf Backup
 * Uses R2 to store bookshelf and settings
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (path === '/health') {
      return Response.json({ status: 'ok', service: 'bookshelf-backup' }, { headers: corsHeaders });
    }

    // Route: /backup/bookshelf
    if (path === '/backup/bookshelf') {
      return handleBookshelf(request, env, corsHeaders);
    }

    // Route: /backup/settings
    if (path === '/backup/settings') {
      return handleSettings(request, env, corsHeaders);
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
};

async function handleBookshelf(request, env, corsHeaders) {
  const R2 = env.BACKUP_BUCKET;
  const key = 'bookshelf.json';

  switch (request.method) {
    case 'GET': {
      const object = await R2.get(key);
      if (!object) {
        return Response.json({ books: [] }, { headers: corsHeaders });
      }
      const data = await object.text();
      return new Response(data, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'PUT': {
      try {
        const body = await request.text();
        await R2.put(key, body, {
          httpMetadata: { contentType: 'application/json' }
        });
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
}

async function handleSettings(request, env, corsHeaders) {
  const R2 = env.BACKUP_BUCKET;
  const key = 'settings.json';

  switch (request.method) {
    case 'GET': {
      const object = await R2.get(key);
      if (!object) {
        return Response.json({}, { headers: corsHeaders });
      }
      const data = await object.text();
      return new Response(data, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'PUT': {
      try {
        const body = await request.text();
        await R2.put(key, body, {
          httpMetadata: { contentType: 'application/json' }
        });
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
}
