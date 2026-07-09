// Cloudflare Worker - proxy para OddsAgora
// 1. Vá em https://workers.cloudflare.com/
// 2. Crie conta grátis
// 3. Crie um novo Worker
// 4. Cole este código
// 5. Clique "Deploy"
// 6. Copie a URL (ex: https://meu-worker.seu-nome.workers.dev)
// 7. Defina OA_WORKER_URL=https://meu-worker.seu-nome.workers.dev nas variáveis de ambiente do Render

const OA_URL = "https://www.oddsagora.com.br";
const OA_PAGE = "/sure-bets/";
const OA_API = "/surebets-ajax/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (target) {
      // Generic proxy mode
      const resp = await fetch(target, {
        headers: {
          "Accept": "*/*",
          "Referer": OA_URL + OA_PAGE,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Accept-Encoding": "gzip, deflate, br"
        }
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });
    }

    // Fetch OA surebets
    // First get session cookies
    const pageResp = await fetch(OA_URL + OA_PAGE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9"
      }
    });
    const cookies = pageResp.headers.get("Set-Cookie") || "";
    const cookieParts = cookies.split(",").map(s => s.split(";")[0].trim()).filter(Boolean).join("; ");

    const resp = await fetch(OA_URL + OA_API, {
      headers: {
        "Accept": "*/*",
        "Referer": OA_URL + OA_PAGE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        ...(cookieParts ? { "Cookie": cookieParts } : {})
      }
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
