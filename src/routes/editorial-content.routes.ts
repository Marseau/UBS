import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Helper function to parse tweets field (can be array or JSON string)
 */
function parseTweets(tweetsField: any): string[] {
    if (!tweetsField) return [];
    if (Array.isArray(tweetsField)) return tweetsField;
    if (typeof tweetsField === 'string') {
        try {
            const parsed = JSON.parse(tweetsField);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * GET /api/editorial-content
 * Fetch approved editorial content for display on landingTM editorial hub
 *
 * Query params:
 * - week_number: number (optional, defaults to current week)
 * - year: number (optional, defaults to current year)
 * - limit: number (optional, max number of weeks to fetch, default 1)
 */
router.get('/editorial-content', async (req: Request, res: Response): Promise<void> => {
    try {
        const { week_number, year, limit = 1 } = req.query;

        // Build query
        let query = supabase
            .from('editorial_content')
            .select('*')
            .order('year', { ascending: false })
            .order('week_number', { ascending: false })
            .limit(parseInt(limit as string) || 1);

        // Apply filters if provided
        if (week_number) {
            query = query.eq('week_number', parseInt(week_number as string));
        }

        if (year) {
            query = query.eq('year', parseInt(year as string));
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching editorial content:', error);
            res.status(500).json({
                error: 'Failed to fetch editorial content',
                details: error.message
            });
            return;
        }

        if (!data || data.length === 0) {
            res.status(404).json({
                error: 'No editorial content found',
                message: 'No approved content available for the specified period'
            });
            return;
        }

        // Transform data for frontend consumption
        const transformedContent = data.map(content => ({
            id: content.id,
            week_number: content.week_number,
            year: content.year,
            publication_date: content.publication_date,
            created_at: content.created_at,

            // Twitter Threads (3 threads × 7 tweets each)
            threads: [
                {
                    thread_number: 1,
                    tweets: parseTweets(content.thread_1_tweets),
                    title: content.thread_1_title || 'Thread #1: Gatilho Inicial',
                    description: 'Problema raiz e agitação'
                },
                {
                    thread_number: 2,
                    tweets: parseTweets(content.thread_2_tweets),
                    title: content.thread_2_title || 'Thread #2: Profundidade Técnica',
                    description: 'Insights técnicos e bastidores'
                },
                {
                    thread_number: 3,
                    tweets: parseTweets(content.thread_3_tweets),
                    title: content.thread_3_title || 'Thread #3: Histórias de Clientes',
                    description: 'Casos de sucesso e resultados'
                }
            ],

            // Instagram Reels (3 reels)
            reels: [
                {
                    reel_number: 1,
                    url: content.reel_1_url,
                    approved: content.reel_1_approved || false,
                    title: content.reel_1_title || `Reel ${content.week_number}/2025 #1`,
                    description: content.reel_1_description || ''
                },
                {
                    reel_number: 2,
                    url: content.reel_2_url,
                    approved: content.reel_2_approved || false,
                    title: content.reel_2_title || `Reel ${content.week_number}/2025 #2`,
                    description: content.reel_2_description || ''
                },
                {
                    reel_number: 3,
                    url: content.reel_3_url,
                    approved: content.reel_3_approved || false,
                    title: content.reel_3_title || `Reel ${content.week_number}/2025 #3`,
                    description: content.reel_3_description || ''
                }
            ].filter(reel => reel.approved), // Only return approved reels

            // YouTube Short
            youtube_short: content.youtube_short_approved ? {
                url: content.youtube_short_url,
                approved: content.youtube_short_approved,
                title: content.youtube_short_title || 'Tutorial Semanal',
                description: content.youtube_short_description || 'Dica prática de automação em 60 segundos'
            } : null,

            // Metadata
            total_tweets: 21,
            total_reels: content.reel_1_approved && content.reel_2_approved && content.reel_3_approved ? 3 :
                         [content.reel_1_approved, content.reel_2_approved, content.reel_3_approved].filter(Boolean).length,
            total_shorts: content.youtube_short_approved ? 1 : 0,
            all_content_approved:
                content.reel_1_approved &&
                content.reel_2_approved &&
                content.reel_3_approved &&
                content.youtube_short_approved &&
                content.thread_1_tweets?.length === 7 &&
                content.thread_2_tweets?.length === 7 &&
                content.thread_3_tweets?.length === 7
        }));

        res.json({
            success: true,
            count: transformedContent.length,
            data: transformedContent
        });

    } catch (error) {
        console.error('Error in editorial content endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/editorial-content/latest
 * Fetch the latest approved editorial content
 */
router.get('/editorial-content/latest', async (req: Request, res: Response): Promise<void> => {
    try {
        const { data, error } = await supabase
            .from('editorial_content')
            .select('*')
            .order('year', { ascending: false })
            .order('week_number', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching latest editorial content:', error);
            res.status(500).json({
                error: 'Failed to fetch latest content',
                details: error.message
            });
            return;
        }

        if (!data) {
            res.status(404).json({
                error: 'No content found',
                message: 'No editorial content available'
            });
            return;
        }

        // Transform data (same structure as above)
        const transformedContent = {
            id: data.id,
            week_number: data.week_number,
            year: data.year,
            publication_date: data.publication_date,
            created_at: data.created_at,

            threads: [
                {
                    thread_number: 1,
                    tweets: parseTweets(data.thread_1_tweets),
                    title: data.thread_1_title || 'Thread #1: Gatilho Inicial',
                    description: 'Problema raiz e agitação'
                },
                {
                    thread_number: 2,
                    tweets: parseTweets(data.thread_2_tweets),
                    title: data.thread_2_title || 'Thread #2: Profundidade Técnica',
                    description: 'Insights técnicos e bastidores'
                },
                {
                    thread_number: 3,
                    tweets: parseTweets(data.thread_3_tweets),
                    title: data.thread_3_title || 'Thread #3: Histórias de Clientes',
                    description: 'Casos de sucesso e resultados'
                }
            ],

            reels: [
                {
                    reel_number: 1,
                    url: data.reel_1_url,
                    approved: data.reel_1_approved || false,
                    title: 'Captação de Leads Automatizada',
                    description: 'Demonstração real de captura e qualificação via WhatsApp'
                },
                {
                    reel_number: 2,
                    url: data.reel_2_url,
                    approved: data.reel_2_approved || false,
                    title: 'Agendamento Inteligente',
                    description: 'Integração Google Calendar em tempo real'
                },
                {
                    reel_number: 3,
                    url: data.reel_3_url,
                    approved: data.reel_3_approved || false,
                    title: 'Follow-up Automático',
                    description: 'Follow-up que reduz no-shows em 80%'
                }
            ].filter(reel => reel.approved),

            youtube_short: data.youtube_short_approved ? {
                url: data.youtube_short_url,
                approved: data.youtube_short_approved,
                title: data.youtube_short_title || 'Tutorial Semanal',
                description: data.youtube_short_description || 'Dica prática de automação em 60 segundos'
            } : null,

            total_tweets: 21,
            total_reels: [data.reel_1_approved, data.reel_2_approved, data.reel_3_approved].filter(Boolean).length,
            total_shorts: data.youtube_short_approved ? 1 : 0,
            all_content_approved:
                data.reel_1_approved &&
                data.reel_2_approved &&
                data.reel_3_approved &&
                data.youtube_short_approved &&
                data.thread_1_tweets?.length === 7 &&
                data.thread_2_tweets?.length === 7 &&
                data.thread_3_tweets?.length === 7
        };

        res.json({
            success: true,
            data: transformedContent
        });

    } catch (error) {
        console.error('Error in latest editorial content endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/editorial-content/stats
 * Get overall statistics about editorial content production
 */
router.get('/editorial-content/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const { data, error } = await supabase
            .from('editorial_content')
            .select('*');

        if (error) {
            console.error('Error fetching editorial content stats:', error);
            res.status(500).json({
                error: 'Failed to fetch stats',
                details: error.message
            });
            return;
        }

        if (!data || data.length === 0) {
            res.json({
                success: true,
                stats: {
                    total_weeks: 0,
                    total_tweets: 0,
                    total_reels: 0,
                    total_shorts: 0,
                    approval_rate: 0
                }
            });
            return;
        }

        // Calculate stats
        const stats = {
            total_weeks: data.length,
            total_tweets: data.length * 21, // 21 tweets per week
            total_reels: data.reduce((acc, content) => {
                return acc + [
                    content.reel_1_approved,
                    content.reel_2_approved,
                    content.reel_3_approved
                ].filter(Boolean).length;
            }, 0),
            total_shorts: data.filter(content => content.youtube_short_approved).length,
            weeks_with_full_approval: data.filter(content =>
                content.reel_1_approved &&
                content.reel_2_approved &&
                content.reel_3_approved &&
                content.youtube_short_approved &&
                content.thread_1_tweets?.length === 7 &&
                content.thread_2_tweets?.length === 7 &&
                content.thread_3_tweets?.length === 7
            ).length,
            approval_rate: 0
        };

        stats.approval_rate = stats.total_weeks > 0
            ? Math.round((stats.weeks_with_full_approval / stats.total_weeks) * 100)
            : 0;

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error in editorial content stats endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/newsletter/subscribe
 * Subscribe to editorial content newsletter
 */
router.post('/newsletter/subscribe', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, source = 'editorial_hub' } = req.body;

        if (!email || !email.includes('@')) {
            res.status(400).json({
                error: 'Invalid email address'
            });
            return;
        }

        // Store newsletter subscription
        const { data, error } = await supabase
            .from('newsletter_subscriptions')
            .insert({
                email: email.toLowerCase().trim(),
                source,
                subscribed_at: new Date().toISOString(),
                is_active: true
            })
            .select()
            .single();

        if (error) {
            // Check if email already exists
            if (error.code === '23505') { // Unique violation
                res.status(409).json({
                    error: 'Email already subscribed',
                    message: 'This email is already subscribed to our newsletter'
                });
                return;
            }

            console.error('Error subscribing to newsletter:', error);
            res.status(500).json({
                error: 'Failed to subscribe',
                details: error.message
            });
            return;
        }

        res.json({
            success: true,
            message: 'Successfully subscribed to newsletter',
            data
        });

    } catch (error) {
        console.error('Error in newsletter subscription endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
