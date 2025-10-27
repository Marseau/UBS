import express, { Request, Response } from 'express';
import { CanvaVideoGeneratorService } from '../services/canva-video-generator.service';

const router = express.Router();

/**
 * 🎬 Rota de Teste - Canva Video Generator
 *
 * Interface UI para validar todo o fluxo:
 * Content Seeder → Canva Video Generator → N8N Webhook → Process Audio → Supabase
 */

/**
 * GET /test-ui - Interface HTML para teste
 */
router.get('/test-ui', (req: Request, res: Response) => {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎬 Canva Video Generator - Teste</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    h1 {
      color: #667eea;
      margin-bottom: 0.5rem;
      font-size: 2.5rem;
    }

    .subtitle {
      color: #666;
      margin-bottom: 2rem;
      font-size: 1.1rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      color: #333;
      font-weight: 600;
    }

    textarea, select, input {
      width: 100%;
      padding: 1rem;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.3s;
    }

    textarea {
      min-height: 150px;
      resize: vertical;
    }

    textarea:focus, select:focus, input:focus {
      outline: none;
      border-color: #667eea;
    }

    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 2rem;
      border: none;
      border-radius: 10px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .status {
      margin-top: 2rem;
      padding: 1.5rem;
      border-radius: 10px;
      display: none;
    }

    .status.loading {
      display: block;
      background: #fff3cd;
      border: 2px solid #ffc107;
      color: #856404;
    }

    .status.success {
      display: block;
      background: #d4edda;
      border: 2px solid #28a745;
      color: #155724;
    }

    .status.error {
      display: block;
      background: #f8d7da;
      border: 2px solid #dc3545;
      color: #721c24;
    }

    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(0,0,0,0.1);
      border-radius: 50%;
      border-top-color: #856404;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .video-preview {
      margin-top: 1rem;
      border-radius: 10px;
      overflow: hidden;
    }

    .video-preview video {
      width: 100%;
      max-height: 500px;
    }

    .flow-diagram {
      margin: 2rem 0;
      padding: 1.5rem;
      background: #f8f9fa;
      border-radius: 10px;
      font-family: monospace;
      font-size: 0.9rem;
      line-height: 1.8;
    }

    .flow-step {
      padding: 0.5rem 0;
      color: #666;
    }

    .flow-step strong {
      color: #667eea;
    }

    .example {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 5px;
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 Canva Video Generator</h1>
    <p class="subtitle">Teste completo do fluxo de geração de vídeos</p>

    <div class="flow-diagram">
      <div class="flow-step">📝 <strong>1. Content Seeder</strong> → Fornece texto editorial do dia</div>
      <div class="flow-step">🎬 <strong>2. Canva Video Generator</strong> → Gera script de locução</div>
      <div class="flow-step">🌐 <strong>3. N8N Webhook</strong> → Exporta vídeo do Canva (MP4 1080p)</div>
      <div class="flow-step">🎙️ <strong>4. Process Audio</strong> → ElevenLabs + Música de fundo</div>
      <div class="flow-step">☁️ <strong>5. Supabase Storage</strong> → Upload do vídeo final</div>
    </div>

    <form id="testForm">
      <div class="form-group">
        <label for="contentText">📄 Conteúdo Editorial (texto do dia)</label>
        <textarea
          id="contentText"
          name="contentText"
          required
          placeholder="Cole aqui o conteúdo editorial que será convertido em vídeo...">Transforme sua presença digital com nosso sistema de agendamentos inteligente.

Nosso sistema oferece agendamento online 24/7, integração com Google Calendar, lembretes automáticos via WhatsApp, e redução de no-shows em até 80%.

Com métricas em tempo real e IA conversacional, você automatiza seu negócio e aumenta suas conversões.

Fidelize seus clientes com uma experiência profissional e moderna.

Descubra como podemos revolucionar seu negócio hoje mesmo!</textarea>
        <div class="example">
          💡 <strong>Dica:</strong> O sistema irá gerar um script de locução de ~60 segundos baseado neste texto
        </div>
      </div>

      <div class="form-group">
        <label for="contentId">🆔 Content ID (para rastreamento)</label>
        <input
          type="text"
          id="contentId"
          name="contentId"
          value="test-content-001"
          required
          placeholder="Ex: editorial-segunda-001">
      </div>

      <div class="form-group">
        <label for="voiceId">🎤 Voz ElevenLabs</label>
        <select id="voiceId" name="voiceId">
          <option value="yQtGAPI0R2jQuAXxLWk1" selected>Bruno - Português (Masculina)</option>
          <option value="pNInz6obpgDQGcFmaJgB">Adam - Inglês (Masculina)</option>
          <option value="EXAVITQu4vr4xnSDxMaL">Bella - Inglês (Feminina)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="musicCategory">🎵 Categoria de Música</label>
        <select id="musicCategory" name="musicCategory">
          <option value="corporate" selected>Corporate (Profissional)</option>
          <option value="uplifting">Uplifting (Energética)</option>
          <option value="trending">Trending (Viral)</option>
          <option value="tech">Tech (Tecnológica)</option>
        </select>
      </div>

      <button type="submit" class="btn" id="submitBtn">
        🚀 Gerar Vídeo Completo
      </button>
    </form>

    <div id="status" class="status"></div>
  </div>

  <script>
    const form = document.getElementById('testForm');
    const statusDiv = document.getElementById('status');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = {
        contentText: formData.get('contentText'),
        contentId: formData.get('contentId'),
        voiceId: formData.get('voiceId'),
        musicCategory: formData.get('musicCategory')
      };

      // Show loading
      statusDiv.className = 'status loading';
      statusDiv.innerHTML = '<span class="spinner"></span> Processando vídeo... Isso pode levar 2-3 minutos.';
      submitBtn.disabled = true;

      try {
        const response = await fetch('/api/canva-video-test/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
          statusDiv.className = 'status success';
          statusDiv.innerHTML = \`
            <h3>✅ Vídeo gerado com sucesso!</h3>
            <p><strong>URL:</strong> <a href="\${result.video_url}" target="_blank">\${result.video_url}</a></p>
            <p><strong>Duração:</strong> \${result.duration_seconds}s</p>
            <p><strong>Custo estimado:</strong> $\${result.cost_usd.toFixed(2)}</p>
            <p><strong>Content ID:</strong> \${result.content_id}</p>
            <div class="video-preview">
              <video controls src="\${result.video_url}">
                Seu navegador não suporta o elemento de vídeo.
              </video>
            </div>
          \`;
        } else {
          throw new Error(result.error || 'Erro desconhecido');
        }
      } catch (error) {
        statusDiv.className = 'status error';
        statusDiv.innerHTML = \`
          <h3>❌ Erro ao gerar vídeo</h3>
          <p>\${error.message}</p>
          <p><small>Verifique se o N8N está rodando e se as credenciais do Canva estão configuradas.</small></p>
        \`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
  `;

  res.send(html);
});

/**
 * POST /generate - Endpoint de teste para gerar vídeo
 */
router.post('/generate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { contentText, contentId, voiceId, musicCategory } = req.body;

    if (!contentText || !contentId) {
      return res.status(400).json({
        error: 'contentText e contentId são obrigatórios'
      });
    }

    console.log('🎬 Iniciando teste de geração de vídeo Canva...');
    console.log(`📄 Content ID: ${contentId}`);

    const videoGenerator = new CanvaVideoGeneratorService();

    const result = await videoGenerator.generateVideo(
      contentText,
      contentId,
      voiceId || 'yQtGAPI0R2jQuAXxLWk1',
      musicCategory || 'corporate'
    );

    console.log('✅ Vídeo gerado com sucesso!');

    res.json(result);
  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo:', error);

    res.status(500).json({
      error: 'Erro ao gerar vídeo',
      message: error.message,
      details: error.stack
    });
  }
});

/**
 * GET /health - Health check
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Canva Video Test routes OK',
    timestamp: new Date().toISOString()
  });
});

export default router;
