/**
 * Refactored WhatsApp Webhook Routes - Main Entry Point
 * This file replaces the original whatsapp-webhook-v3.routes.ts
 *
 * ✅ PRESERVED FUNCTIONALITY:
 * - Demo.html compatibility (x-demo-token bypass)
 * - DEMO_PARITY flag support
 * - All critical flows (greeting, onboarding, appointments, etc)
 * - Rate limiting and spam protection
 * - Signature validation
 * - Session persistence
 * - Intent detection (Regex + LLM)
 * - Conversation outcome mapping
 * - Redis caching
 * - Database operations
 *
 * ✅ ARCHITECTURAL IMPROVEMENTS:
 * - Broken into 6 modules (~300-500 lines each)
 * - Clear separation of concerns
 * - Maintainable code structure
 * - Preserved all external interfaces
 */

// Simply export the modular router
export { default } from './webhook/webhook-routes-core';