/**
 * Dual Persona Video Generator Service
 *
 * Generates viral Instagram Reels using dual persona strategy:
 * - Carla (problem presenter) + Bruno (solution presenter)
 * - ElevenLabs voice cloning for natural speech
 * - D-ID avatar lip-sync video generation
 * - FFmpeg video merging for seamless transitions
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

interface VideoGenerationResult {
  carla_video_url: string;
  bruno_video_url: string;
  merged_video_url: string;
  carla_duration: number;
  bruno_duration: number;
  merged_duration: number;
  total_cost_usd: number;
}

interface PersonaConfig {
  name: 'Carla' | 'Bruno';
  voiceId: string;
  avatarUrl: string;
  script: string;
}

export class DualPersonaVideoGeneratorService {
  private readonly ELEVENLABS_API_KEY: string;
  private readonly ELEVENLABS_VOICE_ID_CARLA: string;
  private readonly ELEVENLABS_VOICE_ID_BRUNO: string;
  private readonly DID_API_KEY: string;
  private readonly DID_AVATAR_CARLA_URL: string;
  private readonly DID_AVATAR_BRUNO_URL: string;

  // Cost constants (updated December 2024)
  private readonly ELEVENLABS_COST_PER_1K_CHARS = 0.30; // $0.30 per 1k characters
  private readonly DID_COST_PER_VIDEO = 0.12; // $0.12 per video (average 15s)

  constructor() {
    this.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
    this.ELEVENLABS_VOICE_ID_CARLA = process.env.ELEVENLABS_VOICE_ID_Carla || '';
    this.ELEVENLABS_VOICE_ID_BRUNO = process.env.ELEVENLABS_VOICE_ID_Bruno || '';
    this.DID_API_KEY = process.env.DID_API_KEY || '';
    this.DID_AVATAR_CARLA_URL = process.env.DID_AVATAR_CARLA_URL || '';
    this.DID_AVATAR_BRUNO_URL = process.env.DID_AVATAR_BRUNO_URL || '';

    this.validateConfig();
  }

  private validateConfig(): void {
    const required = [
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_VOICE_ID_Carla',
      'ELEVENLABS_VOICE_ID_Bruno',
      'DID_API_KEY',
      'DID_AVATAR_CARLA_URL',
      'DID_AVATAR_BRUNO_URL'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate complete dual persona Reel
   */
  async generateDualPersonaReel(
    carlaScript: string,
    brunoScript: string,
    contentId: number | string
  ): Promise<VideoGenerationResult> {
    console.log(`🎬 Starting dual persona Reel generation for content ID ${contentId}`);
    console.log(`📝 Carla script (${carlaScript.length} chars): ${carlaScript}`);
    console.log(`📝 Bruno script (${brunoScript.length} chars): ${brunoScript}`);

    try {
      // Generate videos in parallel for speed
      const [carlaResult, brunoResult] = await Promise.all([
        this.generatePersonaVideo({
          name: 'Carla',
          voiceId: this.ELEVENLABS_VOICE_ID_CARLA,
          avatarUrl: this.DID_AVATAR_CARLA_URL,
          script: carlaScript
        }),
        this.generatePersonaVideo({
          name: 'Bruno',
          voiceId: this.ELEVENLABS_VOICE_ID_BRUNO,
          avatarUrl: this.DID_AVATAR_BRUNO_URL,
          script: brunoScript
        })
      ]);

      console.log(`✅ Carla video: ${carlaResult.videoUrl}`);
      console.log(`✅ Bruno video: ${brunoResult.videoUrl}`);

      // Merge videos with FFmpeg
      const mergedVideoUrl = await this.mergeVideos(
        carlaResult.videoUrl,
        brunoResult.videoUrl,
        contentId
      );

      const totalCost = carlaResult.cost + brunoResult.cost;

      console.log(`✅ Merged video: ${mergedVideoUrl}`);
      console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);

      return {
        carla_video_url: carlaResult.videoUrl,
        bruno_video_url: brunoResult.videoUrl,
        merged_video_url: mergedVideoUrl,
        carla_duration: carlaResult.duration,
        bruno_duration: brunoResult.duration,
        merged_duration: carlaResult.duration + brunoResult.duration,
        total_cost_usd: totalCost
      };

    } catch (error) {
      console.error('❌ Error generating dual persona Reel:', error);
      throw error;
    }
  }

  /**
   * Generate video for a single persona (Carla or Bruno)
   */
  private async generatePersonaVideo(
    config: PersonaConfig
  ): Promise<{ videoUrl: string; duration: number; cost: number }> {
    console.log(`\n🎤 Generating ${config.name} video...`);

    // Step 1: Generate audio with ElevenLabs
    const audioResult = await this.generateAudio(config.voiceId, config.script);

    // Step 2: Upload audio to D-ID
    const audioUrl = await this.uploadAudioToDID(audioResult.audioPath);

    // Step 3: Create video with D-ID
    const videoUrl = await this.createDIDVideo(audioUrl, config.avatarUrl, config.name);

    // Step 4: Calculate costs
    const elevenLabsCost = (config.script.length / 1000) * this.ELEVENLABS_COST_PER_1K_CHARS;
    const didCost = this.DID_COST_PER_VIDEO;
    const totalCost = elevenLabsCost + didCost;

    // Cleanup temp audio file
    fs.unlinkSync(audioResult.audioPath);

    return {
      videoUrl,
      duration: audioResult.duration,
      cost: totalCost
    };
  }

  /**
   * Generate audio with ElevenLabs voice cloning
   */
  private async generateAudio(
    voiceId: string,
    text: string
  ): Promise<{ audioPath: string; duration: number }> {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': this.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    // Save to temp file
    const audioPath = path.join(
      __dirname,
      '..',
      '..',
      'assets',
      `temp-audio-${Date.now()}.mp3`
    );

    fs.writeFileSync(audioPath, Buffer.from(response.data));

    // Estimate duration (rough: 150 words per minute, ~5 chars per word)
    const estimatedDuration = (text.length / 5 / 150) * 60;

    console.log(`   ✅ Audio generated: ${audioPath} (~${estimatedDuration.toFixed(1)}s)`);

    return { audioPath, duration: estimatedDuration };
  }

  /**
   * Upload audio file to D-ID
   */
  private async uploadAudioToDID(audioPath: string): Promise<string> {
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));

    const response = await axios.post(
      'https://api.d-id.com/audios',
      formData,
      {
        headers: {
          'Authorization': this.DID_API_KEY,
          ...formData.getHeaders()
        }
      }
    );

    console.log(`   ✅ Audio uploaded to D-ID: ${response.data.url}`);

    return response.data.url;
  }

  /**
   * Create video with D-ID avatar + audio
   */
  private async createDIDVideo(
    audioUrl: string,
    avatarUrl: string,
    personaName: string
  ): Promise<string> {
    // Create talk
    const createResponse = await axios.post(
      'https://api.d-id.com/talks',
      {
        script: {
          type: 'audio',
          audio_url: audioUrl
        },
        source_url: avatarUrl,
        config: {
          stitch: true,
          result_format: 'mp4',
          fluent: true,
          pad_audio: 0.0
        }
      },
      {
        headers: {
          'Authorization': this.DID_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const talkId = createResponse.data.id;
    console.log(`   ✅ ${personaName} video initiated: ${talkId}`);
    console.log(`   ⏳ Waiting for D-ID processing...`);

    // Poll for completion (max 2 minutes)
    let status = 'created';
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 40;

    while (status !== 'done' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3s interval

      const statusResponse = await axios.get(
        `https://api.d-id.com/talks/${talkId}`,
        {
          headers: {
            'Authorization': this.DID_API_KEY
          }
        }
      );

      status = statusResponse.data.status;
      videoUrl = statusResponse.data.result_url;
      attempts++;

      if (status === 'error') {
        throw new Error(`D-ID video generation failed: ${JSON.stringify(statusResponse.data)}`);
      }

      process.stdout.write('.');
    }

    console.log('');

    if (status !== 'done' || !videoUrl) {
      throw new Error(`D-ID video generation timeout after ${attempts * 3}s`);
    }

    console.log(`   ✅ ${personaName} video ready: ${videoUrl}`);

    return videoUrl;
  }

  /**
   * Merge Carla + Bruno videos using FFmpeg
   */
  private async mergeVideos(
    carlaVideoUrl: string,
    brunoVideoUrl: string,
    contentId: number | string
  ): Promise<string> {
    console.log('\n🎬 Merging videos with FFmpeg...');

    const tempDir = path.join(__dirname, '..', '..', 'assets', 'temp-videos');

    // Create temp directory if not exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const carlaVideoPath = path.join(tempDir, `carla-${contentId}.mp4`);
    const brunoVideoPath = path.join(tempDir, `bruno-${contentId}.mp4`);
    const mergedVideoPath = path.join(tempDir, `merged-${contentId}.mp4`);

    try {
      // Download videos
      await this.downloadVideo(carlaVideoUrl, carlaVideoPath);
      await this.downloadVideo(brunoVideoUrl, brunoVideoPath);

      // Merge with FFmpeg (concat demuxer method)
      const concatListPath = path.join(tempDir, `concat-${contentId}.txt`);
      fs.writeFileSync(concatListPath, `file '${carlaVideoPath}'\nfile '${brunoVideoPath}'`);

      const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedVideoPath}"`;

      console.log(`   Executing: ${ffmpegCommand}`);

      await execAsync(ffmpegCommand);

      console.log(`   ✅ Videos merged: ${mergedVideoPath}`);

      // TODO: Upload merged video to S3/Supabase Storage
      // For now, return local path (in production, upload and return public URL)
      const publicUrl = `/assets/temp-videos/merged-${contentId}.mp4`;

      // Cleanup temp files
      fs.unlinkSync(carlaVideoPath);
      fs.unlinkSync(brunoVideoPath);
      fs.unlinkSync(concatListPath);

      return publicUrl;

    } catch (error) {
      console.error('❌ Error merging videos:', error);

      // Cleanup on error
      [carlaVideoPath, brunoVideoPath, mergedVideoPath].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      throw error;
    }
  }

  /**
   * Download video from URL
   */
  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`   ✅ Downloaded: ${outputPath}`);
  }
}

// Export singleton instance
export const dualPersonaVideoGenerator = new DualPersonaVideoGeneratorService();
