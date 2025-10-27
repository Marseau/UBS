/**
 * Cloudflare Worker - Hybrid Mode
 * - Serve landingTM.html embutido para ubs.app.br
 * - Faz proxy de /assets/* para dev.ubs.app.br (servidor Node.js)
 */

// Importar HTML da landing Taylor Made (será substituído pelo script de build)
const LANDING_HTML = `__LANDING_HTML_PLACEHOLDER__`;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // Se for assets (imagens, CSS, JS), fazer proxy para dev.ubs.app.br
  if (url.pathname.startsWith('/assets/')) {
    try {
      const backendUrl = `https://dev.ubs.app.br${url.pathname}`;
      const backendResponse = await fetch(backendUrl, {
        headers: request.headers,
        method: request.method,
      });
      return backendResponse;
    } catch (error) {
      return new Response('Asset not found', { status: 404 });
    }
  }

  // Se for POST para /api/leads/taylor-made, fazer proxy para dev.ubs.app.br
  if (request.method === "POST" && url.pathname === "/api/leads/taylor-made") {
    try {
      const backendUrl = `https://dev.ubs.app.br${url.pathname}`;
      const backendResponse = await fetch(backendUrl, {
        headers: request.headers,
        method: request.method,
        body: await request.text(),
      });
      return backendResponse;
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: "Erro ao processar requisição"
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // Servir HTML da landing Taylor Made
  return new Response(LANDING_HTML, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
