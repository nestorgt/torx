#!/bin/bash

# GitHub Token Manager
# The torx token has access to both torx and nestor-ai repositories
# This simplifies token management - no need to switch tokens!

case "$1" in
    "status")
        echo "Current GitHub authentication status:"
        gh auth status
        ;;
    "test-torx")
        echo "Testing torx repository access..."
        gh repo view nestorgt/torx --json name,description --jq '.name, .description'
        ;;
    "test-nestor-ai")
        echo "Testing nestor-ai repository access..."
        gh repo view nestorgt/nestor-ai --json name,description --jq '.name, .description'
        ;;
    "test-both")
        echo "Testing both repositories..."
        echo ""
        echo "📁 torx repository:"
        gh repo view nestorgt/torx --json name,description --jq '.name, .description'
        echo ""
        echo "📁 nestor-ai repository:"
        gh repo view nestorgt/nestor-ai --json name,description --jq '.name, .description'
        ;;
    *)
        echo "GitHub Token Manager"
        echo "Usage: $0 {status|test-torx|test-nestor-ai|test-both}"
        echo ""
        echo "Commands:"
        echo "  status         - Show current authentication status"
        echo "  test-torx      - Test torx repository access"
        echo "  test-nestor-ai - Test nestor-ai repository access"
        echo "  test-both      - Test access to both repositories"
        echo ""
        echo "✅ The torx token has access to both repositories!"
        echo "   No need to switch tokens - one token for all repos."
        ;;
esac
