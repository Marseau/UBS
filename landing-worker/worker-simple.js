/**
 * Cloudflare Worker - Desabilita cache e passa requisição direto
 *
 * Este worker simplesmente DESABILITA o caching do Cloudflare
 * e deixa o servidor origin (Node.js) responder diretamente.
 *
 * Deploy: wrangler deploy
 */

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Simplesmente passa a requisição para o origin (servidor configurado no DNS)
  // sem fazer cache

  const response = await fetch(request, {
    cf: {
      // Desabilita todos os caches do Cloudflare
      cacheTtl: 0,
      cacheEverything: false,
    }
  });

  // Retorna a resposta do servidor origin sem modificações
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
