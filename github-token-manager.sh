#!/bin/bash

# GitHub Token Manager for Multiple Repositories
# This script helps manage different GitHub tokens for different repositories
# 
# IMPORTANT: Replace the placeholder tokens below with your actual tokens
# Do not commit this file with real tokens to version control!

TORX_TOKEN="YOUR_TORX_TOKEN_HERE"
NESTOR_AI_TOKEN="YOUR_NESTOR_AI_TOKEN_HERE"

case "$1" in
    "torx")
        if [ "$TORX_TOKEN" = "YOUR_TORX_TOKEN_HERE" ]; then
            echo "❌ Please set your torx token in this script first"
            exit 1
        fi
        echo "Switching to torx token..."
        echo "$TORX_TOKEN" | gh auth login --with-token
        echo "✅ Switched to torx token"
        ;;
    "nestor-ai")
        if [ "$NESTOR_AI_TOKEN" = "YOUR_NESTOR_AI_TOKEN_HERE" ]; then
            echo "❌ Please set your nestor-ai token in this script first"
            exit 1
        fi
        echo "Switching to nestor-ai token..."
        echo "$NESTOR_AI_TOKEN" | gh auth login --with-token
        echo "✅ Switched to nestor-ai token"
        ;;
    "status")
        echo "Current GitHub authentication status:"
        gh auth status
        ;;
    "setup")
        echo "Setting up tokens..."
        echo "Please edit this script and replace the placeholder tokens with your actual tokens:"
        echo "1. TORX_TOKEN=\"your_actual_torx_token\""
        echo "2. NESTOR_AI_TOKEN=\"your_actual_nestor_ai_token\""
        echo ""
        echo "Then run: $0 torx or $0 nestor-ai"
        ;;
    *)
        echo "GitHub Token Manager"
        echo "Usage: $0 {torx|nestor-ai|status|setup}"
        echo ""
        echo "Commands:"
        echo "  torx        - Switch to torx repository token"
        echo "  nestor-ai   - Switch to nestor-ai repository token"
        echo "  status      - Show current authentication status"
        echo "  setup       - Instructions for setting up tokens"
        echo ""
        echo "⚠️  IMPORTANT: Edit this script first to add your actual tokens!"
        ;;
esac
