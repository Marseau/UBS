import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * Editorial Content Service
 * Gerencia conteúdo editorial (threads X, reels Instagram, shorts YouTube)
 */
export class EditorialContentService {
  /**
   * Busca o conteúdo editorial mais recente (última semana publicada)
   */
  static async getLatestContent() {
    const { data, error } = await supabase
      .from('editorial_content')
      .select('*')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw error;
    }

    return this.formatContent(data);
  }

  /**
   * Busca conteúdo de uma semana específica
   */
  static async getContentByWeek(weekNumber: number, year: number) {
    const { data, error } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('week_number', weekNumber)
      .eq('year', year)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return this.formatContent(data);
  }

  /**
   * Busca estatísticas totais do conteúdo editorial
   */
  static async getStatistics() {
    const { data, error } = await supabase
      .from('editorial_content')
      .select('*');

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return {
        total_weeks: 0,
        total_tweets: 0,
        total_reels: 0,
        total_shorts: 0,
      };
    }

    const stats = {
      total_weeks: data.length,
      total_tweets: 0,
      total_reels: 0,
      total_shorts: 0,
    };

    data.forEach((content: any) => {
      // Count tweets from all 3 threads
      if (content.thread_1_tweets) {
        const tweets1 = JSON.parse(content.thread_1_tweets);
        stats.total_tweets += tweets1.length;
      }
      if (content.thread_2_tweets) {
        const tweets2 = JSON.parse(content.thread_2_tweets);
        stats.total_tweets += tweets2.length;
      }
      if (content.thread_3_tweets) {
        const tweets3 = JSON.parse(content.thread_3_tweets);
        stats.total_tweets += tweets3.length;
      }

      // Count reels (3 per week)
      if (content.reel_1_video_url) stats.total_reels++;
      if (content.reel_2_video_url) stats.total_reels++;
      if (content.reel_3_video_url) stats.total_reels++;

      // Count YouTube shorts (1 per week)
      if (content.youtube_short_url) stats.total_shorts++;
    });

    return stats;
  }

  /**
   * Lista todas as semanas disponíveis
   */
  static async listAllWeeks() {
    const { data, error } = await supabase
      .from('editorial_content')
      .select('week_number, year, publication_date, main_theme')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Busca TODO o conteúdo editorial (todas as semanas completas)
   * Para navegação entre semanas no frontend
   */
  static async getAllContent() {
    const { data, error } = await supabase
      .from('editorial_content')
      .select('*')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false });

    if (error) {
      throw error;
    }

    // Formata cada semana
    return (data || []).map(content => this.formatContent(content));
  }

  /**
   * Formata data de YYYY-MM-DD para DD/MM/YYYY
   */
  private static formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Formata o conteúdo para o formato esperado pelo frontend
   */
  private static formatContent(content: any) {
    if (!content) return null;

    // Format publication date
    const formattedDate = this.formatDate(content.publication_date);

    // Parse JSON fields
    const thread1Tweets = content.thread_1_tweets ? JSON.parse(content.thread_1_tweets) : [];
    const thread2Tweets = content.thread_2_tweets ? JSON.parse(content.thread_2_tweets) : [];
    const thread3Tweets = content.thread_3_tweets ? JSON.parse(content.thread_3_tweets) : [];

    // Build threads array
    const threads = [
      {
        title: content.thread_1_title || 'Thread #1',
        description: content.thread_1_sub_theme || '',
        tweets: thread1Tweets,
      },
      {
        title: content.thread_2_title || 'Thread #2',
        description: content.thread_2_sub_theme || '',
        tweets: thread2Tweets,
      },
      {
        title: content.thread_3_title || 'Thread #3',
        description: content.thread_3_sub_theme || '',
        tweets: thread3Tweets,
      },
    ];

    // Build reels array - usando títulos dos threads + data
    const reels = [
      content.reel_1_video_url
        ? {
            title: `${content.thread_1_title || 'Thread #1'} - ${formattedDate}`,
            description: content.thread_1_sub_theme || 'Conteúdo Instagram',
            url: content.reel_1_video_url,
          }
        : null,
      content.reel_2_video_url
        ? {
            title: `${content.thread_2_title || 'Thread #2'} - ${formattedDate}`,
            description: content.thread_2_sub_theme || 'Conteúdo Instagram',
            url: content.reel_2_video_url,
          }
        : null,
      content.reel_3_video_url
        ? {
            title: `${content.thread_3_title || 'Thread #3'} - ${formattedDate}`,
            description: content.thread_3_sub_theme || 'Conteúdo Instagram',
            url: content.reel_3_video_url,
          }
        : null,
    ].filter(Boolean);

    // Build YouTube short object - usando main_theme + data
    const youtubeShort = content.youtube_short_url
      ? {
          title: `${content.main_theme} - ${formattedDate}`,
          description: content.main_theme || 'Conteúdo YouTube',
          url: content.youtube_short_url,
        }
      : null;

    return {
      id: content.id,
      week_number: content.week_number,
      year: content.year,
      main_theme: content.main_theme,
      publication_date: content.publication_date,
      threads,
      reels,
      youtube_short: youtubeShort,
      total_tweets: thread1Tweets.length + thread2Tweets.length + thread3Tweets.length,
      total_reels: reels.length,
      total_shorts: youtubeShort ? 1 : 0,
    };
  }
}
