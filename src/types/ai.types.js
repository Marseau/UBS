"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextError = exports.FunctionCallError = exports.AIError = void 0;
class AIError extends Error {
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = 'AIError';
    }
}
exports.AIError = AIError;
class FunctionCallError extends AIError {
    constructor(functionName, error, args) {
        super(`Function ${functionName} failed: ${error}`, 'FUNCTION_CALL_ERROR', { functionName, args });
    }
}
exports.FunctionCallError = FunctionCallError;
class ContextError extends AIError {
    constructor(message, context) {
        super(message, 'CONTEXT_ERROR', context);
    }
}
exports.ContextError = ContextError;
//# sourceMappingURL=ai.types.js.map