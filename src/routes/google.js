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

        // Redireciona de volta para a página de configurações com sucesso
        res.redirect('/settings?google_auth_status=success');
    } catch (error) {
        console.error('Falha no callback do Google OAuth:', error);
        res.redirect(`/settings?google_auth_status=error&message=${error.message}`);
    }
});

module.exports = router; 