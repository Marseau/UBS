#!/bin/bash

# Auto-commit script - commits every 2 hours
# Usage: Run this script in background to enable automatic commits

LOG_FILE="auto-commit.log"
COMMIT_INTERVAL=7200  # 2 hours in seconds

echo "Starting auto-commit script - commits every 2 hours" >> $LOG_FILE
echo "Started at: $(date)" >> $LOG_FILE

while true; do
    # Check if there are changes to commit
    if ! git diff-index --quiet HEAD --; then
        echo "Changes detected at $(date)" >> $LOG_FILE
        
        # Get current timestamp
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        
        # Add all changes
        git add .
        
        # Create commit with timestamp
        git commit -m "Auto-commit: $TIMESTAMP

Automated commit generated every 2 hours to preserve work progress.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" >> $LOG_FILE 2>&1
        
        echo "Commit created at $(date)" >> $LOG_FILE
    else
        echo "No changes to commit at $(date)" >> $LOG_FILE
    fi
    
    # Wait for 2 hours
    sleep $COMMIT_INTERVAL
done