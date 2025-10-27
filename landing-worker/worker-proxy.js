/**
 * Cloudflare Worker - Proxy para Servidor Node.js via Cloudflare Tunnel
 * Repassa TODAS as requisições preservando o hostname original
 */

const BACKEND_SERVER = "https://dev.ubs.app.br";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Construir URL do backend mantendo path e query string
    const backendUrl = new URL(url.pathname + url.search, BACKEND_SERVER);

    // Criar headers preservando o hostname original
    const headers = new Headers(request.headers);
    headers.set("Host", hostname); // CRÍTICO: servidor Node.js usa isso para rotear
    headers.set("X-Forwarded-Host", hostname);
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

    // Criar requisição para o backend
    const backendRequest = new Request(backendUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : null,
    });

    // Fazer requisição ao backend
    const backendResponse = await fetch(backendRequest);

    // Retornar resposta preservando headers e status
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch (error) {
    console.error("Worker proxy error:", error);
    return new Response(
      JSON.stringify({
        error: "Servidor temporariamente indisponível",
        message: error.message,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
