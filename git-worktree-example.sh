#!/bin/bash
# Git Worktree Examples for WhatsAppSalon-N8N

# 1. Create a worktree for a new feature (e.g., implementing payment integration)
git worktree add ../WhatsAppSalon-payment-feature -b feature/payment-integration

# 2. Create a worktree for bug fixes
git worktree add ../WhatsAppSalon-bugfix -b bugfix/conversation-timeout

# 3. Create a worktree to experiment with dashboard improvements
git worktree add ../WhatsAppSalon-dashboard-v2 -b feature/dashboard-v2

# 4. List all worktrees
echo "Current worktrees:"
git worktree list

# 5. When done with a feature, remove the worktree
# git worktree remove ../WhatsAppSalon-payment-feature

# 6. Clean up any stale worktree references
# git worktree prune

# Practical workflow:
# cd ../WhatsAppSalon-payment-feature
# npm install
# npm run dev
# Make changes, commit, push
# Create PR from feature/payment-integration branch
# After merge, remove worktree