/**
 * Single Video Generator Service
 *
 * Generates ONE unified Instagram Reel with Carla + Bruno speaking sequentially
 * - Concatenates scripts (Carla problem + Bruno solution)
 * - Generates TWO separate audio files (different voices)
 * - Merges audios into single audio file
 * - Generates ONE video with D-ID using merged audio
 * - Uploads to Supabase Storage
 *
 * CRITICAL: This replaces dual-persona-video-generator to eliminate waste
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const execAsync = promisify(exec);

interface VideoGenerationResult {
  video_url: string;
  video_duration_seconds: number;
  cost_usd: number;
  carla_duration: number;
  bruno_duration: number;
}

export class SingleVideoGeneratorService {
  private readonly ELEVENLABS_API_KEY: string;
  private readonly ELEVENLABS_VOICE_ID_CARLA: string;
  private readonly ELEVENLABS_VOICE_ID_BRUNO: string;
  private readonly DID_API_KEY: string;
  private readonly DID_AVATAR_CARLA_URL: string;

  // Cost constants
  private readonly ELEVENLABS_COST_PER_1K_CHARS = 0.30;
  private readonly DID_COST_PER_VIDEO = 0.12;

  private readonly supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  constructor() {
    this.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
    this.ELEVENLABS_VOICE_ID_CARLA = process.env.ELEVENLABS_VOICE_ID_Carla || '';
    this.ELEVENLABS_VOICE_ID_BRUNO = process.env.ELEVENLABS_VOICE_ID_Bruno || '';
    this.DID_API_KEY = process.env.DID_API_KEY || '';
    this.DID_AVATAR_CARLA_URL = process.env.DID_AVATAR_CARLA_URL || '';

    this.validateConfig();
  }

  private validateConfig(): void {
    const required = [
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_VOICE_ID_Carla',
      'ELEVENLABS_VOICE_ID_Bruno',
      'DID_API_KEY',
      'DID_AVATAR_CARLA_URL',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate single unified video with Carla + Bruno
   */
  async generateSingleReel(
    carlaScript: string,
    brunoScript: string,
    contentId: string
  ): Promise<VideoGenerationResult> {
    console.log(`\n🎬 Starting SINGLE unified Reel generation for content ${contentId}`);
    console.log(`📝 Carla script: ${carlaScript.substring(0, 50)}... (${carlaScript.length} chars)`);
    console.log(`📝 Bruno script: ${brunoScript.substring(0, 50)}... (${brunoScript.length} chars)`);

    try {
      // Step 1: Generate two separate audio files (Carla voice + Bruno voice)
      console.log('\n🎤 Step 1: Generating separate audio files...');
      const [carlaAudio, brunoAudio] = await Promise.all([
        this.generateAudio(this.ELEVENLABS_VOICE_ID_CARLA, carlaScript, 'Carla'),
        this.generateAudio(this.ELEVENLABS_VOICE_ID_BRUNO, brunoScript, 'Bruno')
      ]);

      // Step 2: Merge audios into single file with FFmpeg
      console.log('\n🔊 Step 2: Merging audio files...');
      const mergedAudioPath = await this.mergeAudios(
        carlaAudio.audioPath,
        brunoAudio.audioPath,
        contentId
      );

      const totalDuration = carlaAudio.duration + brunoAudio.duration;

      // Step 3: Upload merged audio to D-ID
      console.log('\n☁️ Step 3: Uploading merged audio to D-ID...');
      const audioUrl = await this.uploadAudioToDID(mergedAudioPath);

      // Step 4: Create single video with D-ID using Carla avatar
      console.log('\n🎥 Step 4: Creating video with D-ID...');
      const videoUrl = await this.createDIDVideo(audioUrl, this.DID_AVATAR_CARLA_URL);

      // Step 5: Upload video to Supabase Storage
      console.log('\n📤 Step 5: Uploading to Supabase Storage...');
      const publicUrl = await this.uploadToSupabaseStorage(videoUrl, contentId);

      // Step 6: Calculate costs
      const totalChars = carlaScript.length + brunoScript.length;
      const elevenLabsCost = (totalChars / 1000) * this.ELEVENLABS_COST_PER_1K_CHARS;
      const didCost = this.DID_COST_PER_VIDEO; // Only ONE video now!
      const totalCost = elevenLabsCost + didCost;

      // Cleanup temp files
      console.log('\n🧹 Cleanup temp files...');
      [carlaAudio.audioPath, brunoAudio.audioPath, mergedAudioPath].forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });

      console.log(`\n✅ Single unified Reel generated successfully!`);
      console.log(`   📹 Video URL: ${publicUrl}`);
      console.log(`   ⏱️ Duration: ${totalDuration.toFixed(1)}s (Carla: ${carlaAudio.duration.toFixed(1)}s + Bruno: ${brunoAudio.duration.toFixed(1)}s)`);
      console.log(`   💰 Cost: $${totalCost.toFixed(4)}`);

      return {
        video_url: publicUrl,
        video_duration_seconds: totalDuration,
        cost_usd: totalCost,
        carla_duration: carlaAudio.duration,
        bruno_duration: brunoAudio.duration
      };

    } catch (error) {
      console.error('❌ Error generating single Reel:', error);
      throw error;
    }
  }

  /**
   * Generate audio with ElevenLabs
   */
  private async generateAudio(
    voiceId: string,
    text: string,
    persona: string
  ): Promise<{ audioPath: string; duration: number }> {
    console.log(`   🎙️ Generating ${persona} audio (${text.length} chars)...`);

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

    const timestamp = Date.now();
    const audioPath = path.join(
      __dirname,
      '..',
      '..',
      'assets',
      `${persona.toLowerCase()}-${timestamp}.mp3`
    );

    fs.writeFileSync(audioPath, Buffer.from(response.data));

    // Estimate duration (pt-BR: ~160-180 WPM, ~5 chars/word)
    const estimatedDuration = (text.length / 5 / 170) * 60;

    console.log(`      ✅ ${persona} audio saved: ${path.basename(audioPath)} (~${estimatedDuration.toFixed(1)}s)`);

    return { audioPath, duration: estimatedDuration };
  }

  /**
   * Merge two audio files using FFmpeg
   */
  private async mergeAudios(
    carlaAudioPath: string,
    brunoAudioPath: string,
    contentId: string
  ): Promise<string> {
    const tempDir = path.join(__dirname, '..', '..', 'assets');
    const timestamp = Date.now();
    const mergedAudioPath = path.join(tempDir, `merged-${timestamp}.mp3`);

    // Create concat filter list
    const concatListPath = path.join(tempDir, `concat-${timestamp}.txt`);
    fs.writeFileSync(concatListPath, `file '${carlaAudioPath}'\nfile '${brunoAudioPath}'`);

    // Merge with FFmpeg
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedAudioPath}"`;

    console.log(`   🔧 Executing: ${ffmpegCommand}`);

    try {
      await execAsync(ffmpegCommand);
      console.log(`   ✅ Audio files merged: ${path.basename(mergedAudioPath)}`);

      // Cleanup concat list
      fs.unlinkSync(concatListPath);

      return mergedAudioPath;
    } catch (error) {
      console.error('❌ FFmpeg audio merge error:', error);
      throw error;
    }
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
  private async createDIDVideo(audioUrl: string, avatarUrl: string): Promise<string> {
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
    console.log(`   🎬 Video generation initiated: ${talkId}`);
    console.log(`   ⏳ Waiting for D-ID processing (up to 2 min)...`);

    // Poll for completion
    let status = 'created';
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 40;

    while (status !== 'done' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));

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

    console.log(`   ✅ Video ready from D-ID: ${videoUrl}`);

    return videoUrl;
  }

  /**
   * Upload video to Supabase Storage
   */
  private async uploadToSupabaseStorage(
    videoUrl: string,
    contentId: string
  ): Promise<string> {
    console.log(`   📥 Downloading video from D-ID...`);

    // Download video
    const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    const videoBuffer = Buffer.from(response.data);

    console.log(`   ✅ Video downloaded (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Upload to Supabase Storage
    const fileName = `reel-${contentId}.mp4`;
    const { data, error } = await this.supabase.storage
      .from('instagram-reels')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true // Overwrite if exists
      });

    if (error) {
      console.error('❌ Supabase upload error:', error);
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = this.supabase.storage
      .from('instagram-reels')
      .getPublicUrl(fileName);

    console.log(`   ✅ Video uploaded to Supabase Storage: ${publicUrlData.publicUrl}`);

    return publicUrlData.publicUrl;
  }
}

// Export singleton instance
export const singleVideoGenerator = new SingleVideoGeneratorService();
