import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createStorageBuckets() {
  console.log('🪣 Creating Supabase Storage buckets for media files...\n');

  const buckets = [
    {
      name: 'instagram-reels',
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['video/mp4', 'video/quicktime']
    },
    {
      name: 'youtube-videos',
      public: true,
      fileSizeLimit: 104857600, // 100MB
      allowedMimeTypes: ['video/mp4', 'video/quicktime']
    },
    {
      name: 'video-thumbnails',
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    },
    {
      name: 'background-music',
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav']
    }
  ];

  for (const bucket of buckets) {
    try {
      console.log(`📦 Creating bucket: ${bucket.name}...`);

      const { data, error } = await supabase.storage.createBucket(bucket.name, {
        public: bucket.public,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: bucket.allowedMimeTypes
      });

      if (error) {
        if (error.message.includes('already exists')) {
          console.log(`✅ Bucket ${bucket.name} already exists`);
        } else {
          console.error(`❌ Error creating ${bucket.name}:`, error.message);
        }
      } else {
        console.log(`✅ Bucket ${bucket.name} created successfully!`);
      }
    } catch (err: any) {
      console.error(`❌ Failed to create ${bucket.name}:`, err.message);
    }
  }

  console.log('\n📋 Bucket Summary:');
  console.log('  - instagram-reels: 50MB max, MP4/MOV videos');
  console.log('  - youtube-videos: 100MB max, MP4/MOV videos');
  console.log('  - video-thumbnails: 5MB max, JPEG/PNG/WEBP images');
  console.log('  - background-music: 10MB max, MP3/WAV audio');
  console.log('\n✅ Storage setup complete!');
}

createStorageBuckets().catch(console.error);
