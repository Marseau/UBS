# Conversational AI Enhancement & Refactor Plan (v4)

## 1. Objective

The final goal is to evolve the application from a simple booking bot into a complete and robust virtual assistant. This assistant must handle diverse user scenarios, provide a seamless experience for new and existing customers, and intelligently qualify or deflect non-customer interactions. All of this must be built upon the existing multi-tenant architecture.

## 2. Guiding Principles (CRITICAL)

*   **1. Preserve Original Layout and Structure:** The main dashboard (`dashboard-standardized.html`) **must** replicate the layout and navigational structure of the original dashboard. This is not just about data, but about user experience and workflow.
*   **2. Maintain Functional Sections:** All non-analytical sections from the original dashboard must be preserved. This specifically includes the integrated access to **Settings, Conversations, and Payments**.
*   **3. No Lost Functionality:** No metric, chart, table, or functional link from the original system should be lost in the migration.
*   **4. Context-Aware AI:** The AI must always operate within the context of a specific `tenant_id`. All its knowledge and actions must be scoped to the tenant it is serving.

---

## Phase 1: Backend Foundation - Data & Identity

This phase ensures the database schema can support a more complex understanding of user identity.

*   **[ ] 1.1: Enhance `users` Table for Identity Verification**
    *   **Task:** The current `users` table can only store one phone number. To handle a customer contacting from a new number, we need to support multiple contact points.
    *   **Implementation:** Execute the following `ALTER TABLE` command to add a `JSONB` column that can store an array of secondary phone numbers.
    ```sql
    ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS additional_phones JSONB DEFAULT '[]'::JSONB;
    ```
    *   **Comment:** This allows a single user entity to be associated with multiple phone numbers, solving the "new phone number" problem.

---

## Phase 2: Conversational Intelligence Implementation

This phase focuses on building the "brain" of the AI to handle diverse scenarios beyond simple booking.

*   **[ ] 2.1: Enhance the NLU Model with New Intents**
    *   **Task:** The Natural Language Understanding model needs to be re-trained to recognize a wider range of user intentions.
    *   **Implementation:** Use your AI platform (e.g., Dialogflow, Rasa, or a custom model) to add and train the following new intents with at least 15-20 example phrases for each:
        *   `query_information`: (e.g., "O que vocês fazem?", "Qual o endereço?", "Que tipo de serviço vocês oferecem?")
        *   `query_prices`: (e.g., "Quanto custa o corte?", "Qual o preço da barba?", "Me passa a tabela de preços")
        *   `out_of_scope`: (e.g., "Quero comprar banana", "Qual a previsão do tempo?", "Gostaria de falar com o financeiro")
        *   `claim_existing_identity`: (e.g., "Oi, é o João, já sou cliente", "Sou eu, a Maria, quero marcar", "Vocês já tem meu cadastro, sou o Carlos")

*   **[ ] 2.2: Implement the Intent Router (Dispatcher)**
    *   **Task:** Refactor the core message processing service to act as a router instead of having a single monolithic logic.
    *   **Implementation:** In your `WhatsAppService` (or equivalent), create a "dispatcher" structure. This will replace a simple `if/else` block and call the appropriate handler based on the detected intent.
    ```javascript
    // Pseudocode for the new logic
    async function handleIncomingMessage(message, from, to) {
        const tenantId = await resolveTenant(to);
        const { userId, isNewUser } = await resolveUser(from, tenantId);
        const intent = await nlu.detectIntent(message.text);

        const intentHandlers = {
            'book_appointment': handleBooking,
            'query_information': handleInfoRequest,
            'query_prices': handlePriceRequest,
            'claim_existing_identity': handleIdentityVerification,
            'out_of_scope': handleOutOfScope,
        };

        const handler = intentHandlers[intent.name] || handleOutOfScope;
        await handler({ message, userId, tenantId, isNewUser });
    }
    ```

*   **[ ] 2.3: Implement Specific Intent Handlers**
    *   **Task:** Create the individual functions (`handle...`) that contain the business logic for each scenario.
    *   **Implementation:**
        *   `handleInfoRequest`: Must query `tenants.business_description` and `services` to respond to prospect questions, ending with a call to action.
        *   `handlePriceRequest`: Must query the `services` table for the specific `tenant_id`, list the main services and prices, and end with a call to action.
        *   `handleOutOfScope`: Must respond with a polite, pre-defined message (from `tenants.ai_settings`) that directs the user to a different channel (like an email) and ends the conversation.
        *   `handleIdentityVerification`: This is the most complex handler. It must:
            1.  Be triggered when `isNewUser` is true but the intent is `claim_existing_identity`.
            2.  Initiate a verification sub-flow, asking for a secondary identifier (e.g., "To confirm, what is your registered email?").
            3.  Query the `users` table for a record matching the provided name and email.
            4.  If found, confirm with the user and add the new phone number to the `additional_phones` JSONB array of the existing user record.
            5.  Delete the newly (and incorrectly) created user record for the new phone number to avoid duplication.

---

## Phase 3: Dashboard & UI Reconstruction (Legacy Plan)

This phase, previously discussed, focuses on rebuilding the UI according to the Guiding Principles. Its implementation should follow the completion of the Conversational AI enhancements.

*   **[ ] 3.1: Rebuild the Main Dashboard (`dashboard-standardized.html`)**
*   **[ ] 3.2: Rebuild the Appointments Page (`appointments.html`)**
*   **[ ] 3.3: Rebuild the Customers, Services, and Payments Pages**
*   **[ ] 3.4: Fix All Navigation Links**

## Phase 4: Final Integration & Validation

*   **[ ] 4.1: Full User Flow Testing:** Test all new conversational flows and the rebuilt dashboard.
*   **[ ] 4.2: Code & Project Cleanup:** Safely delete old, unused files.
