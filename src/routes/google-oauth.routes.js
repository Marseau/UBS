const express = require('express');
const router = express.Router();
const { CalendarService } = require('../services/calendar.service');
const { supabaseAdmin } = require('../config/database');

// Assumindo que o CalendarService pode ser instanciado para lidar com a lógica do OAuth
const calendarService = new CalendarService();

/**
 * Rota para iniciar o fluxo de autorização do Google Calendar.
 * Redireciona o usuário para a tela de consentimento do Google.
 * O ID do profissional é passado no parâmetro 'state' para que possamos identificá-lo no retorno.
 */
router.get('/auth/:professionalId', (req, res) => {
    const { professionalId } = req.params;
    // Lógica para gerar a URL de autorização do Google e redirecionar
    // Esta lógica será implementada no CalendarService
    const authUrl = calendarService.generateAuthUrl(professionalId);
    res.redirect(authUrl);
});

/**
 * DEBUG ENDPOINT - Shows the exact OAuth URL being generated
 * GET /api/google-oauth/debug/:professionalId
 */
router.get('/debug/:professionalId', (req, res) => {
    const { professionalId } = req.params;
    try {
        const authUrl = calendarService.generateAuthUrl(professionalId);
        const urlObject = new URL(authUrl);
        const redirectUri = urlObject.searchParams.get('redirect_uri');

        res.json({
            success: true,
            data: {
                full_auth_url: authUrl,
                redirect_uri: redirectUri,
                configured_redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
                client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
                professional_id: professionalId,
                message: "Please ensure this exact redirect_uri is configured in your Google Console"
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: "Failed to generate debug OAuth URL"
        });
    }
});


/**
 * Rota de callback que o Google chama após o consentimento do usuário.
 * Recebe o código, troca por tokens e os salva no banco de dados.
 */
router.get('/oauth2callback', async (req, res) => {
    const { code, state } = req.query;
    const professionalId = state; // Recupera o ID do profissional

    try {
        if (!code || !professionalId) {
            throw new Error('Autorização negada ou ID do profissional ausente.');
        }

        // Troca o código por tokens e os salva
        await calendarService.processOAuthCallback(code, professionalId);

        // Return success page that handles both popup and redirect scenarios
        console.log('🎉 OAuth SUCCESS - Returning success page');
        res.send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Google Calendar - Autorização Concluída</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 50px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            margin: 0;
                        }
                        .container {
                            background: rgba(255,255,255,0.95);
                            color: #333;
                            padding: 40px;
                            border-radius: 15px;
                            max-width: 500px;
                            margin: 0 auto;
                            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                        }
                        .success {
                            color: #28a745;
                            font-size: 18px;
                            margin: 20px 0;
                        }
                        .icon {
                            font-size: 48px;
                            color: #28a745;
                            margin-bottom: 20px;
                        }
                        .button {
                            background: #28a745;
                            color: white;
                            padding: 12px 25px;
                            text-decoration: none;
                            border-radius: 25px;
                            border: none;
                            cursor: pointer;
                            font-size: 16px;
                            transition: all 0.3s ease;
                        }
                        .button:hover {
                            background: #218838;
                            transform: translateY(-2px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">✅</div>
                        <h1>Autorização Concluída!</h1>
                        <p class="success">Google Calendar foi conectado com sucesso!</p>
                        <p>A sincronização automática foi ativada para este profissional.</p>
                        <button class="button" onclick="closeWindow()">Continuar</button>
                    </div>

                    <script>
                        function closeWindow() {
                            if (window.opener) {
                                // Em popup: atualiza página pai e fecha popup
                                try {
                                    window.opener.postMessage({
                                        type: 'GOOGLE_OAUTH_SUCCESS',
                                        professionalId: '${professionalId}'
                                    }, '*');
                                } catch (e) {
                                    console.log('Could not post message to parent window');
                                }
                                window.close();
                            } else {
                                // Redirecionamento normal: vai para página de profissionais
                                window.location.href = '/professionals-standardized.html?google_auth_status=success';
                            }
                        }
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ OAuth ERROR - Falha no callback do Google OAuth:', error);
        console.log('🔄 OAuth ERROR - Returning error page');

        res.send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Google Calendar - Erro na Autorização</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 50px;
                            background: linear-gradient(135deg, #ff7675 0%, #e84393 100%);
                            color: white;
                            margin: 0;
                        }
                        .container {
                            background: rgba(255,255,255,0.95);
                            color: #333;
                            padding: 40px;
                            border-radius: 15px;
                            max-width: 500px;
                            margin: 0 auto;
                            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                        }
                        .error {
                            color: #dc3545;
                            font-size: 18px;
                            margin: 20px 0;
                        }
                        .icon {
                            font-size: 48px;
                            color: #dc3545;
                            margin-bottom: 20px;
                        }
                        .button {
                            background: #6c757d;
                            color: white;
                            padding: 12px 25px;
                            text-decoration: none;
                            border-radius: 25px;
                            border: none;
                            cursor: pointer;
                            font-size: 16px;
                            transition: all 0.3s ease;
                        }
                        .button:hover {
                            background: #5a6268;
                            transform: translateY(-2px);
                        }
                        .error-details {
                            background: #f8f9fa;
                            padding: 15px;
                            border-radius: 8px;
                            margin: 20px 0;
                            font-size: 14px;
                            color: #6c757d;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">❌</div>
                        <h1>Erro na Autorização</h1>
                        <p class="error">Não foi possível conectar o Google Calendar.</p>
                        <div class="error-details">${error.message}</div>
                        <p>Tente novamente ou verifique suas configurações.</p>
                        <button class="button" onclick="closeWindow()">Voltar</button>
                    </div>

                    <script>
                        function closeWindow() {
                            if (window.opener) {
                                // Em popup: notifica erro e fecha popup
                                try {
                                    window.opener.postMessage({
                                        type: 'GOOGLE_OAUTH_ERROR',
                                        error: '${error.message}',
                                        professionalId: '${professionalId}'
                                    }, '*');
                                } catch (e) {
                                    console.log('Could not post message to parent window');
                                }
                                window.close();
                            } else {
                                // Redirecionamento normal: vai para página de profissionais com erro
                                window.location.href = '/professionals-standardized.html?google_auth_status=error&message=${encodeURIComponent(error.message)}';
                            }
                        }

                    </script>
                </body>
            </html>
        `);
    }
});

module.exports = router; 